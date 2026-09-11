# Go 代码规范手册

务必严格遵守！！！

## 不允许任何行尾注释

禁止诸如

```go
xxx // comment
```

## 方法名必须简洁单行注释

优秀示例

```go
// ParseEncodedPolicies 解析 policy 数组
func ParseEncodedPolicies(encoded []string, maxBytes int) ([]*Policy, error) {
return nil, nil
}
```

## 按空行分逻辑

逻辑与逻辑之间按空行分开，不要拥挤，要易于阅读
优秀 case

```go
// ParseEncodedPolicies 解析 policy 数组
func ParseEncodedPolicies(encoded []string, maxBytes int) ([]*Policy, error) {
policies := make([]*Policy, 0, len(encoded))
for i, raw := range encoded {
decoded, err := url.QueryUnescape(raw)
if err != nil {
return nil, fmt.Errorf("policy[%d] is not a valid url_encode string: %w", i, err)
}

// 解码前后一致说明未做 url_encode，直接拒绝
if decoded == raw {
return nil, fmt.Errorf("policy[%d] is not url_encoded", i)
}

if maxBytes > 0 && len(decoded) > maxBytes {
return nil, fmt.Errorf(
"%w: policy[%d] size %d bytes exceeds limit %d",
errOverLimit, i, len(decoded), maxBytes,
)
}

p, err := ParsePolicy(decoded)
if err != nil {
return nil, fmt.Errorf("policy[%d]: %w", i, err)
}

policies = append(policies, p)
}
return policies, nil
}
```

## 禁止过度注释

一些简洁的 const 可以有注释...但是不必在方法签名处写大段方法内部逻辑注释，可以在方法体内适当的时机写
bad case：

```go
package authz

import (
	"context"
	"strings"
)

// ClaimAuthToken JWT payload 中承载权限载荷的 claim 名。
const ClaimAuthToken = "auth_token"

// TokenParser 验签 + 取 claims 的最小抽象；实现方负责验签与时效校验。
type TokenParser interface {
	ParseToken(ctx context.Context, token string) (map[string]any, error)
}

// bearerPrefix Authorization 头的固定前缀（大小写不敏感）。
const bearerPrefix = "bearer "

// TrimBearer 去掉 Authorization 头的 Bearer 前缀，兼容裸 JWT。
func TrimBearer(authorization string) string {
	v := strings.TrimSpace(authorization)
	if len(v) > len(bearerPrefix) && strings.EqualFold(v[:len(bearerPrefix)], bearerPrefix) {
		return strings.TrimSpace(v[len(bearerPrefix):])
	}
	return v
}

// authTokenFromClaims 取出 payload 中的 auth_token：claim 缺失或非字符串时 ok=false
// （按第一方登录态放行），空串由调用方按 token 错误处理。
func authTokenFromClaims(claims map[string]any) (string, bool) {
	v, exists := claims[ClaimAuthToken]
	if !exists {
		return "", false
	}
	s, ok := v.(string)
	if !ok {
		return "", false
	}
	return s, true
}
```

## 代码格式要优雅，容易阅读

good case：

```go
if size := proto.Size(info); i.limits.MaxTokenBytes > 0 && size > i.limits.MaxTokenBytes {
return "", fmt.Errorf(
"%w: token size %d bytes exceeds limit %d",
errOverLimit, size, i.limits.MaxTokenBytes,
)
}
```

## 禁止 panic ，应该 error 上抛让调用方处理

good case

```go
// randUint32 生成随机数（AuthTokenInfo.randNum）；读取失败时返回错误，由调用方处理。
func randUint32() (uint32, error) {
var b [4]byte
if _, err := rand.Read(b[:]); err != nil {
return 0, fmt.Errorf("read crypto/rand: %w", err)
}
return binary.BigEndian.Uint32(b[:]), nil
}
```

## 禁止对小短的逻辑抽函数

这样只会增加阅读成本，该内联内联
bad case

```go
var errOverLimit = errors.New("policy over limit")

func IsOverLimit(err error) bool {
return errors.Is(err, errOverLimit)
}
```

## 禁止结构体字段不空行分隔

good case,字段之间必须有空行隔开，不包括注释

```go
type createThirdAuthTokenReq struct {
// UnionID 第三方应用的服务账号 ID，标识签发归属方。
UnionID string `json:"unionId"`

// Policy 策略 JSON 的 url_encode 结果数组。
Policy []string `json:"policy"`
}
```

## 禁止过程性解释

先是设计 A，然后设计 B 改动，只保留最终的 B 改动说明即可，不允许说明 A 的历史设计
导致出现过程性的描述，我们只面向最终结果，保持代码简洁清晰

## 禁止起 goroutine 不 defer panic

除非有统一的工具包装了 defer panic 逻辑

## 禁止随处定义 const，var

var 应该在文件的上部分定义
禁止在 func 和 func 之间穿插定义 var
理想的层级：

1. const 定义
2. var 定义
3. pub func 定义
4. 该 pub func 用到的 private func

## 禁止难以阅读的短变量命名

字段名要见名知义，例如下面 extensionCount 就不建议叫做 n
good case

```go
if extensionCount := countExtensions(policies); i.limits.MaxExtensions > 0 && extensionCount > i.limits.MaxExtensions {
return "", fmt.Errorf("%w: expanded extensions %d exceed limit %d",
errOverLimit, extensionCount, i.limits.MaxExtensions)
}
```