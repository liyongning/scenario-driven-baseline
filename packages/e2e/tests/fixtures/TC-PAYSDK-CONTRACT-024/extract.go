// 本程序只从锁定 Go 原常量/descriptor/消息取测试数据，不生成或读取生产 TS。
package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go/buf/validate"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	idl "gitlab.daqian369.com/esm/narnia/idl"
	base "gitlab.daqian369.com/esm/narnia/idl/gen/go/base"
	pay "gitlab.daqian369.com/esm/narnia/idl/gen/go/infra/pay/v1"
	trade "gitlab.daqian369.com/esm/narnia/idl/gen/go/infra/trade/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
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
func decoded(data []byte, err error) any {
	if err != nil {
		panic(err)
	}
	var value any
	if err = json.Unmarshal(data, &value); err != nil {
		panic(err)
	}
	return value
}
func main() {
	root := os.Args[1]
	codes := map[string]int64{
		"ErrGatewayProxyInvalidParameter":                            idl.ErrGatewayProxyInvalidParameter,
		"ErrGatewayProxyUnauthorized":                                idl.ErrGatewayProxyUnauthorized,
		"ErrGatewayProxyNotFound":                                    idl.ErrGatewayProxyNotFound,
		"ErrInfraTradeCreateTradePayUnauthorized":                    idl.ErrInfraTradeCreateTradePayUnauthorized,
		"ErrInfraTradeCreateTradePayNotFound":                        idl.ErrInfraTradeCreateTradePayNotFound,
		"ErrInfraTradeCreateTradePayChannelUnavailable":              idl.ErrInfraTradeCreateTradePayChannelUnavailable,
		"ErrInfraTradeCreateTradePayConflict":                        idl.ErrInfraTradeCreateTradePayConflict,
		"ErrInfraTradeCreateTradePayInvalidParameter":                idl.ErrInfraTradeCreateTradePayInvalidParameter,
		"ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter":   idl.ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter,
		"ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter":  idl.ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter,
		"ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter": idl.ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter,
		"ErrInfraTradeCreateTradePayWxIdentityNotFound":              idl.ErrInfraTradeCreateTradePayWxIdentityNotFound,
		"ErrInfraTradeCreateTradePayUnavailable":                     idl.ErrInfraTradeCreateTradePayUnavailable,
		"ErrInfraTradeQueryTradeUnauthorized":                        idl.ErrInfraTradeQueryTradeUnauthorized,
		"ErrInfraTradeQueryTradeInvalidParameter":                    idl.ErrInfraTradeQueryTradeInvalidParameter,
		"ErrInfraTradeQueryTradeNotFound":                            idl.ErrInfraTradeQueryTradeNotFound,
		"ErrInfraTradeQueryTradeUnavailable":                         idl.ErrInfraTradeQueryTradeUnavailable,
	}
	names := make([]string, 0, len(codes))
	for name := range codes {
		names = append(names, name)
	}
	sort.Strings(names)
	catalog := []descriptor{}
	// newGatewayMux(a761953) 使用默认 marshaler；从真实 ServeMux 取得相同实例。
	_, marshaler := runtime.MarshalerForRequest(runtime.NewServeMux(), httptest.NewRequest("POST", "/", nil))
	// JSONProtoField(4dcc8e8) 的原始配置；该函数只另包 baseResp，不改变字段。
	gatewayJSON := protojson.MarshalOptions{UseProtoNames: false, EmitUnpopulated: false}
	for _, name := range names {
		code := codes[name]
		d := idl.DescribeErrorCode(code, "")
		catalog = append(catalog, descriptor{name, strconv.FormatInt(code, 10), d.CanonicalCode.String(), d.BizCodeName, d.Source, d.Retryable})
		b := &base.BaseResp{StatusCode: code, Success: proto.Bool(false), StatusMsg: proto.String("fixture error"), Error: &base.ErrorInfo{BizCode: code, CanonicalCode: d.CanonicalCode, BizCodeName: d.BizCodeName, Source: d.Source, Retryable: d.Retryable}}
		if strings.HasPrefix(name, "ErrGatewayProxy") {
			write(root, "TC-PAYSDK-CONTRACT-017", name, map[string]any{"status": 200, "body": map[string]any{"baseResp": decoded(gatewayJSON.Marshal(b))}})
		} else if strings.HasPrefix(name, "ErrInfraTradeQueryTrade") {
			write(root, "TC-PAYSDK-CONTRACT-017", name, map[string]any{"status": 200, "body": decoded(marshaler.Marshal(&trade.QueryTradeResponse{BaseResp: b}))})
		} else {
			write(root, "TC-PAYSDK-CONTRACT-017", name, map[string]any{"status": 200, "body": decoded(marshaler.Marshal(&trade.CreateTradePayResponse{BaseResp: b}))})
		}
	}
	write(root, "TC-PAYSDK-CONTRACT-024", "idl-errors", catalog)
	// 直接提取 Go descriptor 的 optional/enum 约束，不调用 TS codec 推导期望。
	fields := []protoreflect.FieldDescriptor{
		(&trade.CreateTradePayRequest{}).ProtoReflect().Descriptor().Fields().ByName("xpay_env"),
		(&pay.PrepayRequest{}).ProtoReflect().Descriptor().Fields().ByName("xpay_env"),
	}
	rules := []any{}
	for _, field := range fields {
		constraint := proto.GetExtension(field.Options(), validate.E_Field).(*validate.FieldRules).GetEnum()
		values := map[string]int32{}
		for i := 0; i < field.Enum().Values().Len(); i++ {
			value := field.Enum().Values().Get(i)
			values[string(value.Name())] = int32(value.Number())
		}
		rules = append(rules, map[string]any{"field": string(field.FullName()), "number": field.Number(), "optional": field.HasOptionalKeyword(), "hasPresence": field.HasPresence(), "enum": string(field.Enum().FullName()), "values": values, "rules": decoded(gatewayJSON.Marshal(constraint))})
	}
	write(root, "TC-PAYSDK-CONTRACT-023", "descriptor", rules)
	response := &trade.CreateTradePayResponse{TradeNo: "trade-fixture-001", PaymentNo: "payment-fixture-001", Channel: pay.Channel_CHANNEL_WECHAT_VIRTUAL, ExpireTime: 1800000000000, BaseResp: &base.BaseResp{StatusCode: 0, Success: proto.Bool(true)}, PayParams: &pay.PayParams{Params: &pay.PayParams_WechatVirtual{WechatVirtual: &pay.WechatVirtualPayParams{Mode: "short_series_goods", SignData: ` {"z":"fixture\\quoted", "env":0,"a":"先后顺序"} `, PaySig: "fixture-pay-sig", Signature: "fixture-signature-1"}}}}
	write(root, "TC-PAYSDK-CONTRACT-014", "valid", map[string]any{"status": 200, "body": decoded(marshaler.Marshal(response))})
	response.PayParams.GetWechatVirtual().Signature = "fixture-signature-2"
	write(root, "FLOW-PAYSDK-006", "same-payment", map[string]any{"status": 200, "body": decoded(marshaler.Marshal(response))})
	response.PaymentNo = "payment-fixture-002"
	response.PayParams.GetWechatVirtual().Signature = "fixture-signature-3"
	write(root, "FLOW-PAYSDK-006", "different-payment", map[string]any{"status": 200, "body": decoded(marshaler.Marshal(response))})
	for _, state := range []trade.TradeStatus{trade.TradeStatus_TRADE_STATUS_CREATED, trade.TradeStatus_TRADE_STATUS_PAYING, trade.TradeStatus_TRADE_STATUS_PAID, trade.TradeStatus_TRADE_STATUS_CLOSED} {
		r := &trade.QueryTradeResponse{Trade: &trade.TradeDetail{TradeNo: "trade-fixture-001", Status: state, ExpireTime: 1800000000000}, BaseResp: &base.BaseResp{StatusCode: 0, Success: proto.Bool(true)}}
		write(root, "TC-PAYSDK-CONTRACT-003", state.String(), map[string]any{"status": 200, "body": decoded(marshaler.Marshal(r))})
	}
	for _, c := range []struct {
		name string
		env  *pay.XpayEnv
	}{{"omitted", nil}, {"sandbox", pay.XpayEnv_XPAY_ENV_SANDBOX.Enum()}, {"prod", pay.XpayEnv_XPAY_ENV_PROD.Enum()}} {
		req := &trade.CreateTradePayRequest{TradeNo: "trade-fixture-001", Channel: pay.Channel_CHANNEL_WECHAT_VIRTUAL, AppId: "app-fixture", ClientPlatform: "ios", XpayEnv: c.env, BaseReq: &base.BaseReq{RequestId: "pay-fixture-1", ProductId: "fixture-product"}}
		write(root, "TC-PAYSDK-CONTRACT-023", c.name, map[string]any{"request": decoded(gatewayJSON.Marshal(req)), "response": decoded(marshaler.Marshal(response))})
	}
	write(root, "TC-PAYSDK-CONTRACT-023", "query-no-env", map[string]any{"request": decoded(gatewayJSON.Marshal(&trade.QueryTradeRequest{TradeNo: "trade-fixture-001", BaseReq: &base.BaseReq{RequestId: "pay-fixture-1", ProductId: "fixture-product"}})), "response": decoded(marshaler.Marshal(&trade.QueryTradeResponse{Trade: &trade.TradeDetail{TradeNo: "trade-fixture-001", Status: trade.TradeStatus_TRADE_STATUS_PAYING, ExpireTime: 1800000000000}, BaseResp: &base.BaseResp{StatusCode: 0, Success: proto.Bool(true)}}))})
	fmt.Printf("Extracted %d Go errors and complete request/response fixtures\n", len(catalog))
}
