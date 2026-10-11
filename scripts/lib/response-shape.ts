/**
 * 协议同形校验：从 generated TS 类型派生可达字段（PC-04、PC-01），并据此校验 Shadow 响应体。
 * 只依赖 TypeScript 编译器 API，不导入任何 generated 代码。
 * 放在门禁脚本侧而不是包内：门禁脚本不得出现包目录字面量（ENG-05），协议侧的路由来源与
 * 门禁脚本（contract-inventory）共用同一份实现。
 */
import ts from 'typescript';

/** 可达字段的编码类别；与协议义务派生（contract-inventory）使用同一套类别。 */
export type ShapeEncoding =
  | 'json-string'
  | 'json-number'
  | 'json-int64-string'
  | 'json-boolean'
  | 'enum-name'
  | 'nested-object'
  | 'oneof-object'
  | 'repeated-array'
  | 'string-map';

/** 一个可达字段：路径为 proto 字段名（snake_case）以 `.` 连接。 */
export type ReachableField = Readonly<{
  path: string;
  encoding: ShapeEncoding | undefined;
  optional: boolean;
  oneofBranch: boolean;
  /** `enum-name` 的合法名称列表；其他编码为 undefined。 */
  enumValues?: ReadonlyArray<string> | undefined;
  /** `repeated-array` 的元素编码；元素为对象时子字段另行列出。 */
  elementEncoding?: ShapeEncoding | undefined;
}>;

/** proto 字段名 → TypeScript 属性名（lowerCamel）。 */
export function lowerCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function withoutNullish(type: ts.Type): ts.Type[] {
  return (type.isUnion() ? type.types : [type]).filter(
    (item) => !(item.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
  );
}

export function typeAt(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type {
  return checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
}

export function oneofBranches(
  checker: ts.TypeChecker,
  type: ts.Type,
): Array<Readonly<{ name: string; type: ts.Type }>> | undefined {
  const properties = checker.getPropertiesOfType(type);
  // oneof 的判别方式：唯一的属性名为 `params`（ts_proto 的 oneof 生成形态）。
  if (properties.length !== 1) return undefined;
  const params = properties[0]!;
  if (params.name !== 'params') return undefined;
  const variants = withoutNullish(typeAt(checker, params));
  const branches: Array<Readonly<{ name: string; type: ts.Type }>> = [];
  for (const variant of variants) {
    const members = checker
      .getPropertiesOfType(variant)
      .filter((member) => member.name !== '$case');
    if (members.length !== 1) return undefined;
    branches.push({ name: members[0]!.name, type: typeAt(checker, members[0]!) });
  }
  return branches;
}

/**
 * 枚举的合法取值：ts_proto 生成字符串枚举，在 TS 中表现为枚举字面量的联合，
 * 逐个取字面量值；不能用 `getPropertiesOfType`（联合会退化成 `string` 的原型属性）。
 */
function enumValues(type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  return members.map((member) => String((member as ts.LiteralType).value));
}

export function describeType(
  checker: ts.TypeChecker,
  input: ts.Type,
): Readonly<{
  type: ts.Type;
  encoding?: ShapeEncoding;
  descend: boolean;
  elementEncoding?: ShapeEncoding | undefined;
  enumValues?: ReadonlyArray<string> | undefined;
}> {
  const members = withoutNullish(input);
  const type = members.length === 1 ? members[0]! : input;
  // 动态类型（Any/Unknown/Never）无法判定，交给校验器报"待定"，不得当成 map 或对象放行。
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never))
    return { type, descend: false };
  if (checker.isArrayType(type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0]!;
    const shape = describeType(checker, element);
    return {
      type: shape.type,
      encoding: 'repeated-array',
      descend: shape.descend,
      elementEncoding: shape.encoding,
    };
  }
  if (type.getStringIndexType()) return { type, encoding: 'string-map', descend: false };
  if (type.flags & ts.TypeFlags.EnumLike)
    return { type, encoding: 'enum-name', descend: false, enumValues: enumValues(type) };
  if (type.flags & ts.TypeFlags.StringLike)
    return { type, encoding: 'json-string', descend: false };
  if (type.flags & ts.TypeFlags.NumberLike)
    return { type, encoding: 'json-number', descend: false };
  if (type.flags & ts.TypeFlags.BigIntLike)
    return { type, encoding: 'json-int64-string', descend: false };
  if (type.flags & ts.TypeFlags.BooleanLike)
    return { type, encoding: 'json-boolean', descend: false };
  if (oneofBranches(checker, type)) return { type, encoding: 'oneof-object', descend: true };
  if (type.flags & ts.TypeFlags.Object) return { type, encoding: 'nested-object', descend: true };
  return { type, descend: false };
}

export function collectReachableFields(checker: ts.TypeChecker, root: ts.Type): ReachableField[] {
  const fields: ReachableField[] = [];
  const visit = (type: ts.Type, prefix: string, ancestors: ReadonlySet<ts.Type>) => {
    const branches = oneofBranches(checker, type);
    if (branches) {
      for (const branch of branches) {
        const path = `${prefix}.${snakeCase(branch.name)}`;
        const shape = describeType(checker, branch.type);
        fields.push({
          path,
          encoding: shape.encoding,
          optional: false,
          oneofBranch: true,
          ...(shape.enumValues === undefined ? {} : { enumValues: shape.enumValues }),
          ...(shape.elementEncoding === undefined
            ? {}
            : { elementEncoding: shape.elementEncoding }),
        });
        if (shape.descend && !ancestors.has(shape.type))
          visit(shape.type, path, new Set([...ancestors, shape.type]));
      }
      return;
    }
    for (const property of checker.getPropertiesOfType(type)) {
      const propertyType = typeAt(checker, property);
      const optional =
        Boolean(property.flags & ts.SymbolFlags.Optional) ||
        withoutNullish(propertyType).length !==
          (propertyType.isUnion() ? propertyType.types.length : 1);
      const path = prefix ? `${prefix}.${snakeCase(property.name)}` : snakeCase(property.name);
      const shape = describeType(checker, propertyType);
      fields.push({
        path,
        encoding: shape.encoding,
        optional,
        oneofBranch: false,
        ...(shape.enumValues === undefined ? {} : { enumValues: shape.enumValues }),
        ...(shape.elementEncoding === undefined ? {} : { elementEncoding: shape.elementEncoding }),
      });
      if (shape.descend && !ancestors.has(shape.type))
        visit(shape.type, path, new Set([...ancestors, shape.type]));
    }
  };
  visit(root, '', new Set([root]));
  return fields;
}

function printable(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 校验单个值是否符合某个编码；返回问题列表（空列表表示同形）。 */
function validateEncoding(
  encoding: ShapeEncoding | undefined,
  enumValues: ReadonlyArray<string> | undefined,
  value: unknown,
  path: string,
): string[] {
  if (encoding === undefined) return [`${path}: 字段类型无法判定（待定），不得放行`];
  switch (encoding) {
    case 'json-string':
      return typeof value === 'string' ? [] : [`${path}: 期望字符串，收到 ${printable(value)}`];
    case 'json-number':
      return typeof value === 'number' ? [] : [`${path}: 期望数字，收到 ${printable(value)}`];
    case 'json-int64-string':
      return typeof value === 'string' && /^-?\d+$/.test(value)
        ? []
        : [`${path}: int64 期望十进制字符串，收到 ${printable(value)}`];
    case 'json-boolean':
      return typeof value === 'boolean' ? [] : [`${path}: 期望布尔值，收到 ${printable(value)}`];
    case 'enum-name':
      return typeof value === 'string' && (enumValues ?? []).includes(value)
        ? []
        : [`${path}: 期望合法枚举名称，收到 ${printable(value)}`];
    case 'string-map':
      return isPlainObject(value) ? [] : [`${path}: 期望对象（map），收到 ${printable(value)}`];
    default:
      return isPlainObject(value) ? [] : [`${path}: 期望对象，收到 ${printable(value)}`];
  }
}

/** 按可达字段描述校验响应体；缺少字段不判错（proto3 默认值语义），出现字段则逐项校验。 */
export function validateResponseShape(
  fields: ReadonlyArray<ReachableField>,
  body: unknown,
): string[] {
  const children = new Map<string, ReachableField[]>();
  for (const field of fields) {
    const index = field.path.lastIndexOf('.');
    const parent = index < 0 ? '' : field.path.slice(0, index);
    const list = children.get(parent);
    if (list) list.push(field);
    else children.set(parent, [field]);
  }
  const validateObject = (value: unknown, parent: string, path: string): string[] => {
    const level = children.get(parent) ?? [];
    if (level.length === 0) return [];
    if (!isPlainObject(value)) return [`${path}: 期望对象，收到 ${printable(value)}`];
    const issues: string[] = [];
    const byKey = new Map<string, ReachableField>();
    for (const field of level) {
      const name = field.path.slice(field.path.lastIndexOf('.') + 1);
      byKey.set(name, field);
      byKey.set(lowerCamel(name), field);
    }
    const present = new Set<ReachableField>();
    for (const [key, inner] of Object.entries(value)) {
      const field = byKey.get(key);
      if (!field) {
        issues.push(`${path}.${key}: 响应类型中不存在的字段`);
        continue;
      }
      present.add(field);
      const fieldPath = `${path}.${key}`;
      if (field.encoding === 'nested-object' || field.encoding === 'oneof-object') {
        issues.push(...validateObjectField(field.encoding, inner, field.path, fieldPath));
        continue;
      }
      if (field.encoding === 'repeated-array') {
        if (!Array.isArray(inner)) {
          issues.push(`${fieldPath}: 期望数组，收到 ${printable(inner)}`);
          continue;
        }
        inner.forEach((item, index) => {
          const itemPath = `${fieldPath}[${index}]`;
          // 元素是对象时递归校验其字段，否则按元素编码校验标量；元素类型无法判定时报待定。
          if (field.elementEncoding === 'nested-object' || field.elementEncoding === 'oneof-object')
            issues.push(...validateObjectField(field.elementEncoding, item, field.path, itemPath));
          else issues.push(...validateEncoding(field.elementEncoding, undefined, item, itemPath));
        });
        continue;
      }
      issues.push(...validateEncoding(field.encoding, field.enumValues, inner, fieldPath));
    }
    const branches = level.filter((field) => field.oneofBranch && present.has(field));
    if (branches.length > 1)
      issues.push(
        `${path}: 同一 oneof 出现多个分支 ${branches
          .map((field) => field.path.slice(field.path.lastIndexOf('.') + 1))
          .join('、')}`,
      );
    return issues;
  };
  /** 对象字段：先做对象性检查，通过后再递归校验子字段，避免同一问题报两次。 */
  const validateObjectField = (
    encoding: ShapeEncoding,
    value: unknown,
    parent: string,
    path: string,
  ): string[] => {
    const found = validateEncoding(encoding, undefined, value, path);
    return found.length > 0 ? found : validateObject(value, parent, path);
  };
  return validateObject(body, '', '$');
}
