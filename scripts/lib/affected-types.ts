/** 按需运行的选择结果与命中的测试文件：拆出独立类型模块，供选择、扩展与计划模块共用。 */
export type AffectedTestFile = Readonly<{
  project: string;
  className: string;
  file: string;
}>;

export type AffectedSelection = Readonly<{ id: string; reason: string }>;
