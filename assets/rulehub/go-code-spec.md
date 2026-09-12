# Go 代码规范手册

务必严格遵守！！！

## 不允许任何行尾注释

禁止诸如

```go
xxx // comment
```

只允许上方行注释
```go
// comment
xxx
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

bad case：这里揉在一起，没空行
```go
// ParsePolicy 解析并校验一份策略 JSON：statement 非空、effect 仅 allow / deny、action / resource 非空（兼容 string 与 []string）、condition 仅归一化。
func ParsePolicy(raw string) (*Policy, error) {
	var rp rawPolicy
	if err := json.Unmarshal([]byte(raw), &rp); err != nil {
		return nil, fmt.Errorf("policy is not valid JSON: %w", err)
	}
	if len(rp.Statement) == 0 {
		return nil, fmt.Errorf("policy statement is empty")
	}
	p := &Policy{Version: rp.Version}
	for i, rs := range rp.Statement {
		eff, err := parseEffect(rs.Effect)
		if err != nil {
			return nil, fmt.Errorf("statement[%d]: %w", i, err)
		}
		actions, err := decodeStringOrArray(rs.Action)
		if err != nil {
			return nil, fmt.Errorf("statement[%d] action: %w", i, err)
		}
		resources, err := decodeStringOrArray(rs.Resource)
		if err != nil {
			return nil, fmt.Errorf("statement[%d] resource: %w", i, err)
		}
		if len(actions) == 0 {
			return nil, fmt.Errorf("statement[%d]: action is empty", i)
		}
		if len(resources) == 0 {
			return nil, fmt.Errorf("statement[%d]: resource is empty", i)
		}
		condition, err := normalizeCondition(rs.Condition)
		if err != nil {
			return nil, fmt.Errorf("statement[%d] condition: %w", i, err)
		}
		p.Statement = append(p.Statement, Statement{
			Effect:    eff,
			Action:    actions,
			Resource:  resources,
			Condition: condition,
		})
	}
	return p, nil
}
```

逻辑段开头可以简洁注释说明意图
good case
```go
// CreateThirdAuthToken POST /sts/third/auth-token：为第三方服务账号签发 authToken。
func CreateThirdAuthToken(c *gin.Context, dep Dependency) {
	var req createThirdAuthTokenReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpclient.HandleErrResp(c, pkgerrors.Wrapf(err, code.ParameterInvalid, "invalid request body"))
		return
	}

	// unionId 校验
	if req.UnionID == "" {
		httpclient.HandleParamErrMsgResp(c, "unionId is required")
		return
	}

	// policy 校验
	if len(req.Policy) == 0 {
		httpclient.HandleParamErrMsgResp(c, "policy is required")
		return
	}

	// 解析策略
	policies, err := token.ParseEncodedPolicies(req.Policy, dep.Config().Sts.PolicyMaxBytes)
	if err != nil {
		errCode := int32(code.IamStsPolicyInvalid)
		if errors.Is(err, token.ErrOverLimit) {
			errCode = int32(code.IamStsPolicyOverLimit)
		}
		httpclient.HandleErrResp(c, pkgerrors.Wrap(err, errCode))
		return
	}

	// 签发 auth token
	authToken, err := dep.TokenIssuer().IssueThirdParty(req.UnionID, policies)
	if err != nil {
		errCode := int32(code.InternalServerError)
		if errors.Is(err, token.ErrOverLimit) {
			errCode = int32(code.IamStsPolicyOverLimit)
		}
		httpclient.HandleErrResp(c, pkgerrors.Wrap(err, errCode))
		return
	}

	log.Infof(c.Request.Context(),
		"[iam-sts] third auth-token issued: unionId=%s policies=%d tokenLen=%d",
		req.UnionID, len(policies), len(authToken),
	)

	httpclient.HandleSuccessRespWithData(c, createThirdAuthTokenData{
		AuthToken: authToken,
	})
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


## 禁止使用非命名变量返回值风格 （不允许 return 跟东西）
bad case：
```go
func Register(engine *gin.Engine, dep Dependency) error {
	// 启用 trace 时挂 otel span，并把 TraceID 同步进 context。
	traceCfg := dep.Config().TraceConfigs
	if traceCfg.TraceEnabled {
		engine.Use(traceotel.Register(traceCfg.TraceName, traceCfg.TraceEndpoint))
		engine.Use(middleware.TraceIDSyncMiddleware())
	}

	engine.GET("/status/health", health)
	engine.POST("/sts/third/auth-token", func(c *gin.Context) { api.CreateThirdAuthToken(c, dep) })
	return nil
}
```

good case
```go
func Register(engine *gin.Engine, dep Dependency) (err error) {
	// 启用 trace 时挂 otel span，并把 TraceID 同步进 context。
	traceCfg := dep.Config().TraceConfigs
	if traceCfg.TraceEnabled {
		engine.Use(traceotel.Register(traceCfg.TraceName, traceCfg.TraceEndpoint))
		engine.Use(middleware.TraceIDSyncMiddleware())
	}

	engine.GET("/status/health", health)
	engine.POST("/sts/third/auth-token", func(c *gin.Context) { api.CreateThirdAuthToken(c, dep) })
	return
}
```

## 接口定义在使用方

1. 接口定义在第一个使用方所在的包，实现方返回具体类型
2. 接口只包含使用方实际调用的方法，来新需求时再扩接口，不预留
3. 依赖方向：使用方只认识接口签名，不 import 实现方；实现方挪包、改名不影响使用方编译
4. 禁止接口定义在实现方（会把所有方法塞进去，使用方的 mock 被迫实现用不到的方法，最终滚向 gomock 代码生成）

优秀示例（authz 使用 token 的验签能力，接口定义在 authz，单方法最小接口）

```go
// TokenParser 验签 + 取 claims 的最小抽象；实现方负责验签与时效校验。
type TokenParser interface {
	ParseToken(ctx context.Context, token string) (map[string]any, error)
}
```

## error 必须带上下文包装，一条错误只处理一次

fmt.Errorf 包装必须带定位上下文（参数序号、字段名、关键值），末尾 %w 上抛
判断错误一律 errors.Is / errors.As，禁止 err.Error() 字符串比较
log 与上抛二选一：中间层只上抛，处理终点（handler 层）记一次日志，禁止 log 完再 return
哨兵 error 命名 errXxx，定义在文件头 var 区（与 const/var 层级规则一致）

优秀示例

```go
if maxBytes > 0 && len(decoded) > maxBytes {
	return nil, fmt.Errorf(
		"%w: policy[%d] size %d bytes exceeds limit %d",
		errOverLimit, i, len(decoded), maxBytes,
	)
}
```

bad case

```go
// 字符串比较脆弱，改错误文案就假红/假绿；log 后又 return，错误被记两次
if !strings.Contains(err.Error(), "over limit") {
	errCode = int32(code.IamStsPolicyOverLimit)
}
log.Errorf(ctx, "parse policy failed: %v", err)
return err
```

## context 一律第一个参数透传

1. ctx 是函数第一个参数，命名 ctx
2. 不允许存进 struct 字段或全局变量
3. 逐层透传原始 ctx，禁止中途换成 context.Background()（会丢掉上游的超时和取消）
4. gin handler 里取 c.Request.Context()；需要超时/取消时在入口 WithTimeout 派生
5. 业务数据用显式参数传递，context.Value 只允许 trace/meta 类 middleware 元数据

bad case

```go
func (s *Store) GetDoc(ctx context.Context, docID string) (*Doc, error) {
	ctx = context.Background()
	...
}
```

## 日志必须带模块 tag 和 kv 字段

1. 一律走项目 log 包并传 ctx（log.Infof(c.Request.Context(), ...)），禁止 fmt.Println
2. 行首带模块 tag（如 [iam-sts]），方便 grep 定位
3. 关键字段 kv 平铺（unionId=%s policies=%d），禁止拼成自然语言长句
4. Infof 记关键成功操作，Warnf 记可恢复异常，Errorf 记处理终点的失败

优秀示例

```go
log.Infof(c.Request.Context(),
	"[iam-sts] third auth-token issued: unionId=%s policies=%d tokenLen=%d",
	req.UnionID, len(policies), len(authToken),
)
```

## 测试用标准库编写，函数上方注释场景

1. 测试文件与被测文件同目录同包，命名 xxx_test.go
2. 同构输入输出用表驱动；场景间 setup 或断言维度不同则独立函数
3. 测试函数名上方 // 单行注释，简洁说明场景与预期
4. 断言错误一律 errors.Is，禁止字符串比较
5. 断言信息用 got %v, want %v 格式，带必要上下文
6. 不引入 testify / gomock，标准库足够
7. 依赖外部环境的用例必须可 skip（如 JS_TEST_MYSQL_DSN 未设时 t.Skipf）
8. HTTP handler 测试用 httptest，禁止起真端口

优秀示例

```go
// TestCORSPreflightWildcard 通配 allowlist：preflight 的 ACAO 原样返回 *。
func TestCORSPreflightWildcard(t *testing.T) {
	...
}
```
