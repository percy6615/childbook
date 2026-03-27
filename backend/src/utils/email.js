const nodemailer = require('nodemailer')
const logger = require('./logger')

// ─── 建立 transporter ────────────────────────────────────────────────────────
// 開發環境自動使用 Ethereal（不需真實 SMTP）
// 生產環境讀取環境變數

let transporter

const getTransporter = async () => {
  if (transporter) return transporter

  if (process.env.NODE_ENV === 'test') {
    // 測試環境：使用 stub，不實際發信
    transporter = {
      sendMail: async (opts) => {
        logger.debug(`[Email STUB] To: ${opts.to} | Subject: ${opts.subject}`)
        return { messageId: 'test-message-id' }
      }
    }
    return transporter
  }

  if (!process.env.SMTP_HOST || process.env.SMTP_HOST === 'smtp.ethereal.email') {
    // 自動建立 Ethereal 測試帳號
    try {
      const testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      })
      logger.info(`[Email] Ethereal account: ${testAccount.user}`)
      logger.info('[Email] View sent emails at https://ethereal.email')
    } catch (err) {
      logger.warn('[Email] Could not create Ethereal account, using no-op transporter')
      transporter = { sendMail: async () => ({ messageId: 'no-op' }) }
    }
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  }

  return transporter
}

// ─── 發送密碼重置信件 ─────────────────────────────────────────────────────────
const sendPasswordResetEmail = async ({ to, displayName, resetToken }) => {
  const t = await getTransporter()
  const expiresMin = parseInt(process.env.RESET_TOKEN_EXPIRES_MIN || '30')
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`

  const info = await t.sendMail({
    from: process.env.EMAIL_FROM || '"寶寶日誌系統" <noreply@childbook.app>',
    to,
    subject: '【寶寶日誌】密碼重置申請',
    html: `
      <div style="font-family:'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fdfcf8;border-radius:16px;border:1px solid #e6ede6;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:40px;margin-bottom:8px;">🌿</div>
          <h1 style="font-size:20px;color:#335033;margin:0;">寶寶日誌</h1>
        </div>
        <p style="color:#333;font-size:15px;">您好 ${displayName || to}，</p>
        <p style="color:#555;font-size:14px;line-height:1.7;">
          我們收到您的密碼重置申請。請點擊下方按鈕在 <strong>${expiresMin} 分鐘內</strong>完成密碼重置。
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${resetUrl}"
             style="background:#527f52;color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
            重置密碼
          </a>
        </div>
        <p style="color:#999;font-size:12px;line-height:1.6;">
          若您沒有申請密碼重置，請忽略此信件，您的帳號依然安全。<br/>
          此連結將於 ${expiresMin} 分鐘後失效。
        </p>
        <hr style="border:none;border-top:1px solid #e6ede6;margin:20px 0;" />
        <p style="color:#bbb;font-size:11px;text-align:center;">寶寶日誌 — 幼兒家庭聯絡簿數位化系統</p>
      </div>
    `,
    text: `密碼重置連結（${expiresMin} 分鐘內有效）：\n${resetUrl}`
  })

  // 開發環境印出預覽 URL
  if (nodemailer.getTestMessageUrl && nodemailer.getTestMessageUrl(info)) {
    logger.info(`[Email] Preview URL: ${nodemailer.getTestMessageUrl(info)}`)
  }

  return info
}

module.exports = { sendPasswordResetEmail }
