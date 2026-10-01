// 本程序只从锁定 Go 原常量取测试数据，不生成或读取生产 TS。
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	idl "gitlab.daqian369.com/esm/narnia/idl"
)

type descriptor struct {
	Name          string `json:"name"`
	StatusCode    string `json:"statusCode"`
	CanonicalCode string `json:"canonicalCode"`
	BizCodeName   string `json:"bizCodeName"`
	Source        string `json:"source"`
	Retryable     bool   `json:"retryable"`
}

func write(root, owner, name string, value any) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(err)
	}
	dir := filepath.Join(root, owner)
	if err = os.MkdirAll(dir, 0755); err != nil {
		panic(err)
	}
	if err = os.WriteFile(filepath.Join(dir, name+".json"), append(data, '\n'), 0644); err != nil {
		panic(err)
	}
}
func main() {
	root := os.Args[1]
	codes := map[string]int64{
		"ErrGatewayProxyInvalidParameter":         idl.ErrGatewayProxyInvalidParameter,
		"ErrGatewayProxyUnauthorized":             idl.ErrGatewayProxyUnauthorized,
		"ErrGatewayProxyNotFound":                 idl.ErrGatewayProxyNotFound,
		"ErrInfraTradeQueryTradeUnauthorized":     idl.ErrInfraTradeQueryTradeUnauthorized,
		"ErrInfraTradeQueryTradeInvalidParameter": idl.ErrInfraTradeQueryTradeInvalidParameter,
		"ErrInfraTradeQueryTradeNotFound":         idl.ErrInfraTradeQueryTradeNotFound,
		"ErrInfraTradeQueryTradeUnavailable":      idl.ErrInfraTradeQueryTradeUnavailable,
	}
	names := make([]string, 0, len(codes))
	for name := range codes {
		names = append(names, name)
	}
	sort.Strings(names)
	catalog := []descriptor{}
	for _, name := range names {
		code := codes[name]
		d := idl.DescribeErrorCode(code, "")
		catalog = append(catalog, descriptor{name, strconv.FormatInt(code, 10), d.CanonicalCode.String(), d.BizCodeName, d.Source, d.Retryable})
	}
	write(root, "SCN-PROTOCOL-CONTRACT-003", "idl-errors", catalog)
	fmt.Printf("Extracted %d Go errors\n", len(catalog))
}
