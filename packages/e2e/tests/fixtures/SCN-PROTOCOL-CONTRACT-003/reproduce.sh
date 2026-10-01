#!/bin/sh
# 参数：包含固定提交的本地 IDL Git 仓库、输出目录。只在临时 archive 内执行 Go。
set -eu
idl_repo=$(cd "$1" && pwd)
output_dir=$(cd "$2" && pwd)
input_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
archive_dir=$(mktemp -d)
trap 'rm -rf "$archive_dir"' EXIT
git -C "$idl_repo" archive 5539be8f09323709fa65f6568efe22896ec35d24 | tar -x -C "$archive_dir"
cd "$archive_dir"
go run "$input_dir/extract.go" "$output_dir"
go test . -run '^Test(DescribeErrorCodeInfraTradePayContracts|PayParamsJSONShapeIsTheFrontendContract|XpayEnvIsTheSingleCrossServiceSandboxSwitch)$' -count=1 -v
python3 "$input_dir/defensive-fixtures.py" "$output_dir"
python3 "$input_dir/refresh-manifests.py" "$output_dir" "$archive_dir"
