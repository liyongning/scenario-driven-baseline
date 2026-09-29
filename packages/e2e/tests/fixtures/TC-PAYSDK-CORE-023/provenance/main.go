package main

import (
  "encoding/json"
  "fmt"

  idl "gitlab.daqian369.com/esm/narnia/idl"
  base "gitlab.daqian369.com/esm/narnia/idl/gen/go/base"
  payv1 "gitlab.daqian369.com/esm/narnia/idl/gen/go/infra/pay/v1"
  tradev1 "gitlab.daqian369.com/esm/narnia/idl/gen/go/infra/trade/v1"
  "google.golang.org/protobuf/encoding/protojson"
)

func main() {
  request := &tradev1.CreateTradeRequest{
    BizType: "payment_sdk_live", BizTradeNo: "live-fixture-1", UserId: 42,
    GoodsType: payv1.GoodsType_GOODS_TYPE_VIRTUAL, PayAmount: 1,
    Items: []*tradev1.TradeItem{{
      BizOrderNo: "live-fixture-1-1", SkuId: "sdk-live-test-sku", SkuName: "支付 SDK 联调商品",
      SkuSnapshot: &tradev1.SkuSnapshot{WechatVirtualProductId: "sdk-live-test-sku", BizSnapshot: "{}"},
      Quantity: 1, UnitPrice: 1, PayAmount: 1,
    }},
    OriginalAmount: 1, BaseReq: &base.BaseReq{RequestId: "live-request-1", ProductId: "product"},
  }
  success := true
  response := &tradev1.CreateTradeResponse{TradeNo: "trade-1", OrderNos: []string{"order-1"}, Status: tradev1.TradeStatus_TRADE_STATUS_CREATED, BaseResp: &base.BaseResp{Success: &success}}
  requestJSON, _ := (protojson.MarshalOptions{}).Marshal(request)
  responseJSON, _ := (protojson.MarshalOptions{EmitUnpopulated: true}).Marshal(response)
  output := map[string]any{
    "request": json.RawMessage(requestJSON), "response": json.RawMessage(responseJSON),
    "errors": map[string]int64{
      "ErrInfraTradeCreateTradeInvalidParameter": idl.ErrInfraTradeCreateTradeInvalidParameter,
      "ErrInfraTradeCreateTradeUnauthorized": idl.ErrInfraTradeCreateTradeUnauthorized,
      "ErrInfraTradeCreateTradeConflict": idl.ErrInfraTradeCreateTradeConflict,
      "ErrInfraTradeCreateTradeUnavailable": idl.ErrInfraTradeCreateTradeUnavailable,
    },
  }
  encoded, _ := json.MarshalIndent(output, "", "  ")
  fmt.Println(string(encoded))
}
