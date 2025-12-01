import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  initialize() {
    // Configuration du transporteur email
    // Pour le développement, utiliser un service comme Mailtrap ou Gmail
    // Pour la production, utiliser AWS SES, SendGrid, etc.
    
    if (process.env.EMAIL_SERVICE === 'gmail') {
      // Configuration Gmail
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD // App password pour Gmail
        }
      });
    } else if (process.env.EMAIL_SERVICE === 'ses') {
      // Configuration AWS SES
      this.transporter = nodemailer.createTransport({
        host: process.env.SES_HOST,
        port: 587,
        secure: false,
        auth: {
          user: process.env.SES_USERNAME,
          pass: process.env.SES_PASSWORD
        }
      });
    } else {
      // Configuration par défaut (SMTP générique)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
        port: process.env.SMTP_PORT || 2525,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  async sendVerificationCode(email, code, userName = 'User') {
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'xrpTip'} <${process.env.EMAIL_FROM || 'noreply@xrptip.com'}>`,
      to: email,
      subject: 'Vérifiez votre email - xrpTip',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: #ffffff;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #00AAE4 0%, #0066CC 100%);
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
            }
            .code-box {
              background: #f8f9fa;
              border: 2px dashed #00AAE4;
              border-radius: 8px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 48px;
              font-weight: bold;
              color: #00AAE4;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .expires {
              color: #666;
              font-size: 14px;
              margin-top: 15px;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning p {
              margin: 0;
              color: #856404;
              font-size: 14px;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background: #00AAE4;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Bienvenue sur xrpTip !</h1>
            </div>
            
            <div class="content">
              <p>Bonjour ${userName},</p>
              
              <p>Merci de vous être inscrit sur <strong>xrpTip</strong> ! Pour finaliser votre inscription, veuillez vérifier votre adresse email en utilisant le code ci-dessous :</p>
              
              <div class="code-box">
                <div class="code">${code}</div>
                <div class="expires">⏱️ Ce code expire dans 15 minutes</div>
              </div>
              
              <p>Entrez ce code dans l'application pour activer votre compte et commencer à recevoir des tips en XRP !</p>
              
              <div class="warning">
                <p><strong>⚠️ Sécurité :</strong> Ne partagez jamais ce code avec personne. L'équipe xrpTip ne vous demandera jamais ce code par email ou téléphone.</p>
              </div>
              
              <p>Si vous n'avez pas créé de compte sur xrpTip, vous pouvez ignorer cet email en toute sécurité.</p>
              
              <p style="margin-top: 30px;">
                À bientôt,<br>
                <strong>L'équipe xrpTip</strong> 💙
              </p>
            </div>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} xrpTip. Tous droits réservés.</p>
              <p>Propulsé par le XRP Ledger 🚀</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Bienvenue sur xrpTip !

Votre code de vérification : ${code}

Ce code expire dans 15 minutes.

Entrez ce code dans l'application pour activer votre compte.

Si vous n'avez pas créé de compte, ignorez cet email.

L'équipe xrpTip
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de vérification envoyé:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Erreur envoi email:', error);
      throw new Error('Erreur lors de l\'envoi de l\'email de vérification');
    }
  }

  async sendWelcomeEmail(email, userName) {
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'xrpTip'} <${process.env.EMAIL_FROM || 'noreply@xrptip.com'}>`,
      to: email,
      subject: 'Bienvenue sur xrpTip !',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00AAE4 0%, #0066CC 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 30px; background: #00AAE4; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Bienvenue sur xrpTip !</h1>
            </div>
            <div class="content">
              <p>Bonjour ${userName},</p>
              <p>Votre email a été vérifié avec succès !</p>
              <p>Vous pouvez maintenant profiter de toutes les fonctionnalités de xrpTip :</p>
              <ul>
                <li>Créer votre profil de créateur</li>
                <li>Recevoir des tips en XRP</li>
                <li>Suivre vos statistiques en temps réel</li>
                <li>Partager votre lien personnalisé</li>
              </ul>
              <p style="text-align: center;">
                <a href="${process.env.CLIENT_URL}/dashboard" class="button">Accéder à mon Dashboard</a>
              </p>
              <p>À bientôt,<br><strong>L'équipe xrpTip</strong> 💙</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de bienvenue envoyé');
    } catch (error) {
      console.error('❌ Erreur envoi email bienvenue:', error);
      // Ne pas throw ici, c'est pas critique
    }
  }

  async sendPasswordResetCode(email, code) {
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'xrpTip'} <${process.env.EMAIL_FROM || 'noreply@xrptip.com'}>`,
      to: email,
      subject: 'Réinitialisation de votre mot de passe - xrpTip',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .code-box { background: #f8f9fa; border: 2px dashed #00AAE4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .code { font-size: 36px; font-weight: bold; color: #00AAE4; letter-spacing: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>🔐 Réinitialisation de mot de passe</h2>
            <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
            <p>Utilisez le code ci-dessous :</p>
            <div class="code-box">
              <div class="code">${code}</div>
              <p style="color: #666; font-size: 14px; margin-top: 10px;">Ce code expire dans 15 minutes</p>
            </div>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <p>L'équipe xrpTip</p>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de reset mot de passe envoyé');
    } catch (error) {
      console.error('❌ Erreur envoi email reset:', error);
      throw new Error('Erreur lors de l\'envoi de l\'email');
    }
  }
}

// Singleton
const emailService = new EmailService();

export default emailService;