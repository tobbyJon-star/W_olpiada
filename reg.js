import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

const TOKEN = '9221555974:AAHSM4Kxst-RF-ZmOPvTNykk2CPIveayc3Y';
const ADMIN_IDS = [8310040875, 8299255756, 7214173766]; // O'z Telegram ID raqamingiz`
const USERS_FILE = './users.json';

const bot = new TelegramBot(TOKEN, { polling: true });

let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : {};
const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

let steps = {};
let temp = {};

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// Har bir foydalanuvchi uchun noyob id (bir xil ism bo'lsa ham to'qnashmaydi)
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Telefon raqam O'zbekiston raqami ekanini tekshiradi (+998 XX XXX XX XX)
const normalizeUzPhone = (raw) => {
  let digits = (raw || '').replace(/\D/g, ''); // faqat raqamlar
  if (digits.length === 9) digits = '998' + digits; // 901234567 -> 998901234567
  if (digits.startsWith('998') && digits.length === 12) {
    return '+' + digits;
  }
  return null; // O'zbekiston raqami emas
};

const authMenu = {
  reply_markup: {
    keyboard: [["📝 Ro'yxatdan o'tish", "🔑 Login"]],
    resize_keyboard: true
  }
};

const adminMenu = {
  reply_markup: {
    keyboard: [["👥 Ro'yxatdan o'tganlar", "◀️ Orqaga"]],
    resize_keyboard: true
  }
};

const cancelMenu = {
  reply_markup: {
    keyboard: [["❌ Bekor qilish"]],
    resize_keyboard: true
  }
};

const phoneMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "📱 Telefon raqamni ulashish", request_contact: true }],
      ["❌ Bekor qilish"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

const gradeMenu = {
  reply_markup: {
    keyboard: [
      ["3-sinf", "4-sinf"],
      ["❌ Bekor qilish"]
    ],
    resize_keyboard: true
  }
};

// --- Majburiy obuna ---
const CHANNEL = '@WebKing_uz';
const CHANNEL_URL = 'https://t.me/WebKing_uz';

const subscribeMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "📢 Kanalga o'tish", url: CHANNEL_URL }],
      [{ text: "✅ Obunani tekshirish", callback_data: 'check_sub' }]
    ]
  }
};

// Foydalanuvchi kanalga obuna bo'lganini tekshiradi
async function isSubscribed(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    console.error('Obunani tekshirishda xatolik:', e.message);
    return false; // bot kanalda admin bo'lmasa yoki kanal topilmasa
  }
}

const sendSubscribePrompt = (chatId) =>
  bot.sendMessage(
    chatId,
    `📢 Botdan to'liq foydalanish uchun avval kanalimizga obuna bo'ling:\n\n👉 ${CHANNEL}\n\nObuna bo'lgach, pastdagi "✅ Obunani tekshirish" tugmasini bosing.`,
    subscribeMenu
  );

// /start berilganda chiqadigan olimpiada e'loni
const START_TEXT =
`🏆 <b>Bilimingizni sinab ko'rishga tayyormisiz?</b>

<b>WEBKING ACADEMY</b> va <b>WESTER KIDS</b> hamkorligida 3–4-sinf o'quvchilari uchun bilimlar olimpiadasi!

🧠 Bilimingizni namoyon eting, tengdoshlaringiz bilan bellashing va qimmatbaho sovg'alarni qo'lga kiritish imkoniyatiga ega bo'ling! 🎁

📌 Ishtirok etish uchun pastdagi tugmani bosing va ro'yxatdan o'ting!

Omad sizga yor bo'lsin! 🌟`;

// Obuna tasdiqlangandan keyingi samimiy xush kelibsiz xabari
const welcomeText = (user) =>
`🎉 <b>Tabriklaymiz, ${user.name}!</b>

Siz <b>WEBKING ACADEMY</b> va <b>WESTER KIDS</b> olimpiadasiga muvaffaqiyatli qo'shildingiz! 🏆

Endi bilimingizni namoyon etishga, tengdoshlaringiz bilan bellashishga va qimmatbaho sovg'alarni qo'lga kiritishga tayyormisiz? 🎁

Bu — sizning g'alabangiz sari ilk qadam. Biz sizga ishonamiz, omad yor bo'lsin! 🌟

👤 <b>${user.name} ${user.surname || ''}</b>`;

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const currentUser = Object.values(users).find((u) => u.chatId === chatId);

  if (text === '/start' || text === '❌ Bekor qilish') {
    delete steps[chatId];
    delete temp[chatId];

    if (currentUser) {
      // Majburiy obuna: obuna bo'lmagan bo'lsa menyu berilmaydi
      if (!(await isSubscribed(msg.from.id))) {
        return sendSubscribePrompt(chatId);
      }
      return bot.sendMessage(chatId, `Xush kelibsiz, <b>${currentUser.name}</b>!`, {
        parse_mode: 'HTML',
        ...userMenu(chatId)
      });
    }
    return bot.sendMessage(chatId, START_TEXT, { parse_mode: 'HTML', ...authMenu });
  }

  if (text === '🚪 Chiqish') {
    if (currentUser) {
      currentUser.chatId = null;
      saveUsers();
    }
    return bot.sendMessage(chatId, "Akkauntdan chiqdingiz.", authMenu);
  }

  // Register
  if (text === "📝 Ro'yxatdan o'tish") {
    steps[chatId] = 'REG_FULLNAME';
    temp[chatId] = {};
    return bot.sendMessage(chatId, "Ism va familyangizni kiriting (masalan: Ali Valiyev):", cancelMenu);
  }

  if (steps[chatId] === 'REG_FULLNAME') {
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return bot.sendMessage(chatId, "❌ Ism va familyani birga kiriting (masalan: Ali Valiyev):");
    }
    temp[chatId].name = parts[0];
    temp[chatId].surname = parts.slice(1).join(' ');
    steps[chatId] = 'REG_PHONE';
    return bot.sendMessage(
      chatId,
      "📱 Telefon raqamingizni ulashing (pastdagi tugmani bosing):",
      phoneMenu
    );
  }

  if (steps[chatId] === 'REG_PHONE') {
    const raw = msg.contact ? msg.contact.phone_number : text;
    const phone = normalizeUzPhone(raw);

    if (!phone) {
      return bot.sendMessage(
        chatId,
        "❌ Faqat O'zbekiston raqami qabul qilinadi (masalan: +998 90 123 45 67).\n\nIltimos, pastdagi \"📱 Telefon raqamni ulashish\" tugmasidan foydalaning:",
        phoneMenu
      );
    }

    temp[chatId].phone = phone;
    steps[chatId] = 'REG_GRADE';
    return bot.sendMessage(chatId, "🎓 Nechanchi sinfda o'qiysiz? Pastdan tanlang:", gradeMenu);
  }

  if (steps[chatId] === 'REG_GRADE') {
    const grade = Number(text.replace('-sinf', '').trim());
    if (grade !== 3 && grade !== 4) {
      return bot.sendMessage(chatId, "❌ Iltimos, pastdagi tugmalardan sinfingizni tanlang (3-sinf yoki 4-sinf):", gradeMenu);
    }
    temp[chatId].grade = grade;
    steps[chatId] = 'REG_SCHOOL';
    return bot.sendMessage(chatId, "🏫 Nechanchi maktabda o'qiysiz? (masalan: 25)", cancelMenu);
  }

  if (steps[chatId] === 'REG_SCHOOL') {
    const school = Number(text);
    if (!Number.isInteger(school) || school < 1 || school > 1000) {
      return bot.sendMessage(chatId, "❌ Maktab raqamini kiriting (masalan: 25):");
    }

    const id = generateId();
    users[id] = {
      id,
      name: temp[chatId].name,
      surname: temp[chatId].surname,
      phone: temp[chatId].phone,
      grade: temp[chatId].grade,
      school: school,
      chatId: chatId,
      date: new Date().toLocaleString()
    };
    saveUsers();

    delete steps[chatId];
    delete temp[chatId];

    // Majburiy obuna: maktabdan keyin to'g'ridan-to'g'ri so'raladi
    return sendSubscribePrompt(chatId);
  }

  // Login
  if (text === "🔑 Login") {
    steps[chatId] = 'LOG_NAME';
    return bot.sendMessage(chatId, "Ismingizni kiriting:", cancelMenu);
  }

  if (steps[chatId] === 'LOG_NAME') {
    const name = text.toLowerCase();
    const account = Object.values(users).find((u) => u.name.toLowerCase() === name);
    if (!account) {
      return bot.sendMessage(chatId, "❌ Bunday foydalanuvchi topilmadi. Qayta kiriting:");
    }
    account.chatId = chatId;
    saveUsers();

    const loggedName = account.name;
    delete steps[chatId];
    delete temp[chatId];

    await bot.sendMessage(chatId, `✅ Xush kelibsiz, <b>${loggedName}</b>!`, {
      parse_mode: 'HTML'
    });

    // Majburiy obuna: login qilgach har doim so'raladi
    return sendSubscribePrompt(chatId);
  }

  // Majburiy obuna: menyu funksiyalaridan (Profilim, Admin...) oldin tekshiramiz
  if (currentUser && !(await isSubscribed(msg.from.id))) {
    return sendSubscribePrompt(chatId);
  }

  if (text === "👤 Profilim" && currentUser) {
    return bot.sendMessage(
      chatId,
      `👤 <b>Ism:</b> ${currentUser.name}\n👥 <b>Familya:</b> ${currentUser.surname || '-'}\n📱 <b>Telefon:</b> ${currentUser.phone || '-'}\n🎓 <b>Sinf:</b> ${currentUser.grade || '-'}\n🏫 <b>Maktab:</b> ${currentUser.school || '-'}\n📅 <b>Sana:</b> ${currentUser.date}`,
      { parse_mode: 'HTML' }
    );
  }

  // Admin panel
  if (isAdmin(chatId)) {
    if (text === "⚙️ Admin Panel") {
      return bot.sendMessage(chatId, "⚙️ Admin panel:", adminMenu);
    }

    if (text === "◀️ Orqaga") {
      return bot.sendMessage(chatId, "Asosiy menyu:", userMenu(chatId));
    }

    if (text === "👥 Ro'yxatdan o'tganlar") {
      const entries = Object.entries(users);
      if (entries.length === 0) {
        return bot.sendMessage(chatId, "Hozircha hech kim ro'yxatdan o'tmagan.");
      }

      await bot.sendMessage(chatId, `👥 <b>Ro'yxatdan o'tganlar (${entries.length} ta):</b>`, {
        parse_mode: 'HTML'
      });

      // Har bir foydalanuvchi alohida — pastida "O'chirish" tugmasi bilan
      for (let i = 0; i < entries.length; i++) {
        const [key, u] = entries[i];
        const info = `${i + 1}. 👤 <b>${u.name} ${u.surname || ''}</b>\n📱 ${u.phone || '-'}\n🎓 ${u.grade || '-'}-sinf, 🏫 ${u.school || '-'}-maktab\n📅 <i>${u.date}</i>`;
        await bot.sendMessage(chatId, info, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: "🗑 O'chirish", callback_data: `del_${key}` }]]
          }
        });
      }
      return;
    }
  }
});

// "✅ Obunani tekshirish" tugmasi bosilganda
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'check_sub') {
    if (await isSubscribed(userId)) {
      await bot.answerCallbackQuery(query.id, { text: "✅ Rahmat! Obuna tasdiqlandi." });
      const currentUser = Object.values(users).find((u) => u.chatId === chatId);
      const message = currentUser
        ? welcomeText(currentUser)
        : "✅ Obuna tasdiqlandi!";
      return bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        ...userMenu(chatId)
      });
    }
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Siz hali kanalga obuna bo'lmadingiz! Avval obuna bo'ling.",
      show_alert: true
    });
  }

  // Foydalanuvchini o'chirish (faqat admin)
  if (query.data.startsWith('del_')) {
    if (!isAdmin(userId)) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Sizda ruxsat yo'q!", show_alert: true });
    }
    const key = query.data.slice(4);
    if (!users[key]) {
      return bot.answerCallbackQuery(query.id, { text: "Bu foydalanuvchi allaqachon o'chirilgan.", show_alert: true });
    }
    const removed = users[key];
    delete users[key];
    saveUsers();
    await bot.answerCallbackQuery(query.id, { text: "🗑 O'chirildi" });
    return bot.editMessageText(`❌ <s>${removed.name} ${removed.surname || ''}</s> — o'chirildi`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML'
    });
  }
});

const userMenu = (chatId) => ({
  reply_markup: {
    keyboard: isAdmin(chatId)
      ? [["👤 Profilim", "🚪 Chiqish"], ["⚙️ Admin Panel"]]
      : [["👤 Profilim", "🚪 Chiqish"]],
    resize_keyboard: true
  }
});

console.log('🚀 Bot muvaffaqiyatli ishga tushdi va ishlamoqda...');