// import 'dotenv/config';
// import http from 'http';
// import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
// import { Boom } from '@hapi/boom';
// import QRCode from 'qrcode';
// import pino from 'pino';
// import { usePostgresAuthState, shouldSendDailyMenu } from './authStore.js';
// import { getTodayInfo } from './menus.js';

// let latestQR: string | null = null;
// let isConnected = false;

// const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// const PORT = Number(process.env.PORT) || 3000;

// http
//   .createServer(async (req, res) => {
//     if (req.url === '/health') {
//       res.writeHead(200, { 'Content-Type': 'application/json' });
//       res.end(JSON.stringify({ status: 'ok', whatsappConnected: isConnected }));
//       return;
//     }

//     if (req.url === '/qr') {
//       res.writeHead(200, { 'Content-Type': 'text/html' });
//       if (isConnected) {
//         res.end('<h2>WhatsApp is Connected!</h2>');
//       } else if (latestQR) {
//         const img = await QRCode.toDataURL(latestQR);
//         res.end(`
//           <html>
//             <head><meta http-equiv="refresh" content="10"></head>
//             <body style="font-family:sans-serif;text-align:center;padding:40px;">
//               <h2>Scan with WhatsApp Linked Devices</h2>
//               <img src="${img}" width="280" />
//               <p>Page refreshes automatically every 10 seconds.</p>
//             </body>
//           </html>
//         `);
//       } else {
//         res.end('<html><head><meta http-equiv="refresh" content="3"></head><body><h3>Generating QR...</h3></body></html>');
//       }
//       return;
//     }

//     res.writeHead(200, { 'Content-Type': 'text/plain' });
//     res.end('WhatsApp Bot Running. Visit /qr to connect.');
//   })
//   .listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// async function startBot() {
//   const { state, saveCreds, clearSession } = await usePostgresAuthState();
//   const { version } = await fetchLatestBaileysVersion();

//   const sock = makeWASocket({
//     version,
//     auth: state,
//     logger: pino({ level: 'silent' }),
//   });

//   sock.ev.on('creds.update', saveCreds);

//   sock.ev.on('connection.update', async (update) => {
//     const { connection, lastDisconnect, qr } = update;

//     if (qr) {
//       latestQR = qr;
//       isConnected = false;
//       console.log(`New QR ready! Open http://localhost:${PORT}/qr to scan.`);
//     }

//     if (connection === 'open') {
//       latestQR = null;
//       isConnected = true;
//       console.log('WhatsApp connected!');
//     }

//     if (connection === 'close') {
//       isConnected = false;
//       const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
//       const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

//       if (shouldReconnect) {
//         console.log('Connection dropped. Reconnecting...');
//         setTimeout(startBot, 3000);
//       } else {
//         console.log('Logged out. Clearing session and restarting for new QR...');
//         await clearSession();
//         setTimeout(startBot, 3000);
//       }
//     }
//   });

//   sock.ev.on('messages.upsert', async ({ messages, type }) => {
//     if (type !== 'notify') return;

//     for (const msg of messages) {
//       const jid = msg.key.remoteJid;

//       // Ignore own messages, status updates, group chats, and empty protocol events
//       if (
//         !jid ||
//         !msg.message ||
//         msg.key.fromMe ||
//         jid === 'status@broadcast' ||
//         jid.endsWith('@g.us')
//       ) {
//         continue;
//       }

//       const { dateStr, dayName, menu } = getTodayInfo();

//       const isFirstMessageToday = await shouldSendDailyMenu(jid, dateStr);
//       if (!isFirstMessageToday) {
//         continue;
//       }

//       console.log(`Sending ${dayName} menu to ${jid}`);

//       await sock.sendPresenceUpdate('composing', jid);
//       await delay(2000 + Math.random() * 2000);
//       await sock.sendPresenceUpdate('paused', jid);
//       if (menu.image) {
//   await sock.sendMessage(jid, {
//     image: { url: menu.image },
//     caption: menu.text,
//   });
// } else {
//   await sock.sendMessage(jid, { text: menu.text });
// }  
//     }
//   });
// }

// startBot();


import 'dotenv/config';
import http from 'http';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import { usePostgresAuthState, shouldSendDailyMenu } from './authStore.js';
import { getTodayInfo } from './menus.js';

let latestQR: string | null = null;
let isConnected = false;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const PORT = Number(process.env.PORT) || 3000;
const QR_SECRET = process.env.QR_SECRET || 'change-this-secret';

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', whatsappConnected: isConnected }));
      return;
    }

    if (url.pathname === '/qr') {
      if (url.searchParams.get('key') !== QR_SECRET) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (isConnected) {
        res.end('<h2>WhatsApp is Connected!</h2>');
      } else if (latestQR) {
        const img = await QRCode.toDataURL(latestQR);
        res.end(`
          <html>
            <head><meta http-equiv="refresh" content="10"></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;">
              <h2>Scan with WhatsApp Linked Devices</h2>
              <img src="${img}" width="280" />
              <p>Page refreshes automatically every 10 seconds.</p>
            </body>
          </html>
        `);
      } else {
        res.end('<html><head><meta http-equiv="refresh" content="3"></head><body><h3>Generating QR...</h3></body></html>');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot Running.');
  })
  .listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

async function startBot() {
  const { state, saveCreds, clearSession } = await usePostgresAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      isConnected = false;
      console.log(`New QR ready! Open http://localhost:${PORT}/qr?key=${QR_SECRET} to scan.`);
    }

    if (connection === 'open') {
      latestQR = null;
      isConnected = true;
      console.log('WhatsApp connected!');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('Connection dropped. Reconnecting...');
        setTimeout(startBot, 3000);
      } else {
        console.log('Logged out. Clearing session and restarting for new QR...');
        await clearSession();
        setTimeout(startBot, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;

      // Ignore own messages, status updates, group chats, and empty protocol events
      if (
        !jid ||
        !msg.message ||
        msg.key.fromMe ||
        jid === 'status@broadcast' ||
        jid.endsWith('@g.us')
      ) {
        continue;
      }

      const { dateStr, dayName, menu } = getTodayInfo();

      const isFirstMessageToday = await shouldSendDailyMenu(jid, dateStr);
      if (!isFirstMessageToday) {
        continue;
      }

      console.log(`Sending ${dayName} menu to ${jid}`);

      await sock.sendPresenceUpdate('composing', jid);
      await delay(2000 + Math.random() * 2000);
      await sock.sendPresenceUpdate('paused', jid);

      if (menu.image) {
        await sock.sendMessage(jid, {
          image: { url: menu.image },
          caption: menu.text,
        });
      } else {
        await sock.sendMessage(jid, { text: menu.text });
      }
    }
  });
}

startBot();