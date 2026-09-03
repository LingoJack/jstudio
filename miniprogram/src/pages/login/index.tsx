import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'

import { PAGE_DOCUMENTS, TOAST_DURATION_MS } from '../../constants'
import { createRemoteClient } from '../../lib/remote/client'
import { remoteErrorMessage, type RemoteError } from '../../lib/remote/types'
import { saveAuth } from '../../lib/storage/authStorage'
import './index.scss'

const client = createRemoteClient()

type AuthMode = 'login' | 'register'

/** 登录 / 注册后落登录态并整体跳转到文档列表。 */
function settleSession(serverUrl: string, loginToken: { token: string; expires_at: string; user: { user_id: string; username: string } }) {
  saveAuth({
    serverUrl,
    token: loginToken.token,
    expiresAt: loginToken.expires_at,
    user: loginToken.user,
  })
  Taro.reLaunch({ url: PAGE_DOCUMENTS })
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    !submitting && serverUrl.trim().length > 0 && username.length > 0 && password.length > 0

  const submit = async () => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const res = await client.login(serverUrl, username, password)
        settleSession(serverUrl, res)
      } else {
        // 注册成功后直接换 token，一步进入列表。
        await client.register(serverUrl, username, password)
        const res = await client.login(serverUrl, username, password)
        settleSession(serverUrl, res)
      }
    } catch (e) {
      Taro.showToast({
        title: remoteErrorMessage(e as RemoteError),
        icon: 'none',
        duration: TOAST_DURATION_MS,
      })
      setSubmitting(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-brand'>
        <Text className='login-brand-title'>JStudio</Text>
        <Text className='login-brand-sub'>远程文档伴读</Text>
      </View>

      <View className='login-form'>
        <View className='login-field'>
          <Text className='login-label'>服务器地址</Text>
          <Input
            className='login-input'
            type='text'
            placeholder='https://your-backend.example.com'
            placeholderClass='login-placeholder'
            value={serverUrl}
            onInput={(e) => setServerUrl(e.detail.value)}
          />
        </View>
        <View className='login-field'>
          <Text className='login-label'>用户名</Text>
          <Input
            className='login-input'
            type='text'
            placeholder='3-32 字符'
            placeholderClass='login-placeholder'
            value={username}
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>
        <View className='login-field'>
          <Text className='login-label'>密码</Text>
          <Input
            className='login-input'
            type='safe-password'
            password
            placeholder='至少 8 位'
            placeholderClass='login-placeholder'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        <Button
          className='jstudio-btn-primary login-submit'
          disabled={!canSubmit}
          onClick={submit}
        >
          {mode === 'login' ? '登录' : '注册并登录'}
        </Button>

        <View
          className='login-mode-switch'
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          <Text>
            {mode === 'login' ? '没有账号？注册一个' : '已有账号？直接登录'}
          </Text>
        </View>
      </View>
    </View>
  )
}
