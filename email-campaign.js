import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  // Fichier contenant les emails (un par ligne)
  emailsFile: path.join(__dirname, 'creators.txt'),
  
  // Délai entre chaque email (en ms) - 2 secondes pour éviter le spam
  delayBetweenEmails: 2000,
  
  // Mode test (true = affiche sans envoyer, false = envoie réellement)
  testMode: false,
  
  // SMTP Config
  smtp: {
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  },
  
  // Email settings
  from: {
    name: process.env.EMAIL_FROM_NAME || 'xrpTip',
    email: process.env.EMAIL_FROM || 'hello@xrptip.com'
  }
};

// Template email HTML
const getEmailTemplate = (creatorName = '') => {
  const greeting = creatorName ? `Bonjour ${creatorName}` : 'Bonjour';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #0080FF 0%, #00D4FF 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #0080FF 0%, #00D4FF 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      margin: 20px 0;
    }
    .features {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .feature {
      margin: 15px 0;
      padding-left: 30px;
      position: relative;
    }
    .feature:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #0080FF;
      font-weight: bold;
      font-size: 20px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 12px;
    }
    .highlight {
      background: #fff3cd;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🚀 xrpTip</div>
    <p style="margin: 0; font-size: 18px;">Recevez des tips en XRP instantanément</p>
  </div>
  
  <div class="content">
    <p>${greeting},</p>
    
    <p>
      Je vous contacte pour vous présenter <strong>xrpTip</strong>, une plateforme qui permet à vos supporters 
      de vous envoyer des tips en <strong>XRP</strong> de manière simple et instantanée.
    </p>
    
    <div class="features">
      <div class="feature">
        <strong>Tips en XRP instantanés</strong><br>
        Vos supporters envoient des XRP directement sur votre wallet
      </div>
      <div class="feature">
        <strong>QR Code personnalisé</strong><br>
        Un QR code unique pour faciliter les donations
      </div>
      <div class="feature">
        <strong>Profil public</strong><br>
        Une page dédiée pour présenter votre contenu
      </div>
      <div class="feature">
        <strong>0 frais de setup</strong><br>
        Gratuit à utiliser, seulement <span class="highlight">5% de frais</span> sur les tips
      </div>
      <div class="feature">
        <strong>Paiements crypto rapides</strong><br>
        Transactions en quelques secondes via le XRP Ledger
      </div>
    </div>
    
    <p>
      <strong>Comment ça marche ?</strong>
    </p>
    <p>
      1️⃣ Créez votre profil créateur en 2 minutes<br>
      2️⃣ Connectez votre wallet XRP<br>
      3️⃣ Partagez votre lien ou QR code<br>
      4️⃣ Recevez des tips instantanément
    </p>
    
    <div style="text-align: center;">
      <a href="https://xrptip.com/register" class="cta-button">
        Créer mon profil gratuitement 🚀
      </a>
    </div>
    
    <p>
      Vous pouvez voir un exemple de profil créateur ici : 
      <a href="https://xrptip.com/u/demo" style="color: #0080FF;">xrptip.com/u/demo</a>
    </p>
    
    <p>
      Si vous avez des questions, n'hésitez pas à me répondre directement !
    </p>
    
    <p>
      Cordialement,<br>
      <strong>L'équipe xrpTip</strong>
    </p>
  </div>
  
  <div class="footer">
    <p>
      <a href="https://xrptip.com" style="color: #0080FF; text-decoration: none;">xrptip.com</a> • 
      <a href="https://xrptip.com/privacy" style="color: #0080FF; text-decoration: none;">Politique de confidentialité</a>
    </p>
    <p>
      Vous recevez cet email car nous pensons que xrpTip pourrait vous intéresser.<br>
      Si vous ne souhaitez plus recevoir d'emails, répondez simplement "STOP".
    </p>
  </div>
</body>
</html>
  `.trim();
};

// Template email texte brut (fallback)
const getEmailText = (creatorName = '') => {
  const greeting = creatorName ? `Bonjour ${creatorName}` : 'Bonjour';
  
  return `
${greeting},

Je vous contacte pour vous présenter xrpTip, une plateforme qui permet à vos supporters de vous envoyer des tips en XRP de manière simple et instantanée.

✓ Tips en XRP instantanés
✓ QR Code personnalisé
✓ Profil public
✓ 0 frais de setup (seulement 5% sur les tips)
✓ Paiements crypto rapides

Comment ça marche ?
1️⃣ Créez votre profil créateur en 2 minutes
2️⃣ Connectez votre wallet XRP
3️⃣ Partagez votre lien ou QR code
4️⃣ Recevez des tips instantanément

Créer mon profil : https://xrptip.com/register
Exemple de profil : https://xrptip.com/u/demo

Si vous avez des questions, n'hésitez pas à me répondre !

Cordialement,
L'équipe xrpTip

---
xrptip.com
Vous recevez cet email car nous pensons que xrpTip pourrait vous intéresser.
Si vous ne souhaitez plus recevoir d'emails, répondez "STOP".
  `.trim();
};

// Lire les emails depuis le fichier
const readEmails = () => {
  try {
    const content = fs.readFileSync(CONFIG.emailsFile, 'utf-8');
    const emails = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('@'));
    
    return emails;
  } catch (error) {
    console.error('❌ Erreur lecture fichier:', error.message);
    return [];
  }
};

// Créer le transporteur email
const createTransporter = () => {
  return nodemailer.createTransport(CONFIG.smtp);
};

// Envoyer un email
const sendEmail = async (transporter, email, index, total) => {
  const mailOptions = {
    from: `"${CONFIG.from.name}" <${CONFIG.from.email}>`,
    to: email,
    subject: '🚀 Recevez des tips en XRP avec xrpTip',
    text: getEmailText(),
    html: getEmailTemplate()
  };
  
  if (CONFIG.testMode) {
    console.log(`[${index}/${total}] 📧 TEST MODE - Email à: ${email}`);
    return { success: true, test: true };
  }
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[${index}/${total}] ✅ Email envoyé à: ${email}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[${index}/${total}] ❌ Erreur envoi à ${email}:`, error.message);
    return { success: false, error: error.message };
  }
};

// Attendre un délai
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main function
const main = async () => {
  console.log('═══════════════════════════════════════');
  console.log('  xrpTip - Campagne Email Créateurs');
  console.log('═══════════════════════════════════════\n');
  
  // Vérifier les variables d'environnement
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.error('❌ Variables SMTP_USER et SMTP_PASSWORD requises dans .env');
    process.exit(1);
  }
  
  // Vérifier le mode
  if (CONFIG.testMode) {
    console.log('⚠️  MODE TEST ACTIVÉ - Aucun email ne sera envoyé');
    console.log('   Pour envoyer réellement, modifier testMode: false dans le script\n');
  }
  
  // Lire les emails
  console.log(`📂 Lecture du fichier: ${CONFIG.emailsFile}`);
  const emails = readEmails();
  
  if (emails.length === 0) {
    console.error('❌ Aucun email valide trouvé dans le fichier');
    console.log('\n💡 Créez le fichier creators.txt avec un email par ligne:');
    console.log('   creator1@example.com');
    console.log('   creator2@example.com');
    process.exit(1);
  }
  
  console.log(`✅ ${emails.length} email(s) trouvé(s)\n`);
  
  // Créer le transporteur
  const transporter = createTransporter();
  
  // Vérifier la connexion SMTP
  if (!CONFIG.testMode) {
    try {
      await transporter.verify();
      console.log('✅ Connexion SMTP OK\n');
    } catch (error) {
      console.error('❌ Erreur connexion SMTP:', error.message);
      process.exit(1);
    }
  }
  
  // Statistiques
  const stats = {
    total: emails.length,
    sent: 0,
    failed: 0
  };
  
  // Envoyer les emails
  console.log('🚀 Début de l\'envoi...\n');
  
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const result = await sendEmail(transporter, email, i + 1, emails.length);
    
    if (result.success) {
      stats.sent++;
    } else {
      stats.failed++;
    }
    
    // Attendre entre chaque email (sauf le dernier)
    if (i < emails.length - 1) {
      await delay(CONFIG.delayBetweenEmails);
    }
  }
  
  // Résumé
  console.log('\n═══════════════════════════════════════');
  console.log('  📊 Résumé de la campagne');
  console.log('═══════════════════════════════════════');
  console.log(`Total:    ${stats.total}`);
  console.log(`Envoyés:  ${stats.sent} ✅`);
  console.log(`Échoués:  ${stats.failed} ❌`);
  console.log('═══════════════════════════════════════\n');
  
  if (CONFIG.testMode) {
    console.log('💡 Pour envoyer réellement:');
    console.log('   1. Modifier testMode: false dans le script');
    console.log('   2. Relancer: node email-campaign.js\n');
  }
};

// Exécuter
main().catch(console.error);