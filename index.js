// ============================================================
//  ✨ SENSATIONAL SUITE — Bot + Dynamic Selfbot Login
// ============================================================

const { Client: BotClient, GatewayIntentBits, ChannelType, EmbedBuilder,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { Client: SelfClient } = require('discord.js-selfbot-v13');

const axios    = require('axios');
const FormData = require('form-data');
const fs       = require('fs');
const path     = require('path');
const express  = require('express');

// ==================== ENV ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DB_FILE   = path.join(__dirname, 'db.json');

const VIDEO_NAME       = 'SENSATIONAL';
const IMAGE_EXTS       = ['.jpg','.jpeg','.png','.gif','.bmp','.webp'];
const VIDEO_EXTS       = ['.mp4','.mov','.avi','.mkv','.webm','.flv'];
const MAX_FILE_SIZE_MB = 25;
const SLEEP_MS         = 800;
const MAX_RETRIES      = 3;
const FILES_PER_MSG    = 2;
// Dynamic webhook settings — changeable via /selfbot-webhook-name and /selfbot-webhook-pfp
let WEBHOOK_NAME   = 'SENSATIONAL';
let WEBHOOK_AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAAsUlEQVR42u3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8GXHmAAGhi4cUAAAAAElFTkSuQmCC';

const MINOR_PATTERNS = [
  /i(?:'m| am) (\d{1,2})(?: years? old)?/i,
  /(\d{1,2}) ?y\.?o\.?/i,
  /age[: ]+(\d{1,2})/i,
  /born in (200\d|201\d)/i,
  /\b(13|14|15|16|17)\s*(?:years?\s*old|yo|y\.o\.)\b/i,
  /grade\s*\d+/i,
  /i(?:'m| am) in\s+(?:middle|high)\s*school/i,
  /\b(?:freshman|sophomore|junior|senior)\s+(?:in\s+)?(?:high\s+)?school\b/i,
];
// =============================================

// ==================== SELFBOT MANAGER ====================
// Dynamically create/destroy selfbot on demand
let self = null;

async function loginSelfbot(token) {
  // Destroy existing selfbot if any
  if (self) {
    try { self.destroy(); } catch(_) {}
    self = null;
    await sleep(1000);
  }

  return new Promise((resolve, reject) => {
    const newSelf = new SelfClient();
    const timeout = setTimeout(() => reject(new Error('Login timed out after 15 seconds')), 15000);

    newSelf.once('ready', () => {
      clearTimeout(timeout);
      self = newSelf;
      // Save token to DB
      const db = loadDB();
      db._userToken = token;
      saveDB(db);
      resolve(newSelf.user.tag);
    });

    newSelf.login(token).catch(e => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

function getSelfbotStatus() {
  if (!self || !self.user) return '❌ Not logged in';
  return `✅ Logged in as **${self.user.tag}**`;
}
// =========================================================

// ==================== DATABASE ====================
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function getGuildConfig(guildId) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {
    supervisedChannels: [], attachmentChannels: [], logChannel: null,
    warnRole: null, detectionLogs: [], modStats: {},
    boostRole: null, boostLogChannel: null, founderRole: null, templates: {}
  };
  return { db, config: db[guildId] };
}
function updateGuildConfig(guildId, updates) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  Object.assign(db[guildId], updates);
  saveDB(db);
}
// ==================================================

// ==================== BOT CLIENT ====================
const bot = new BotClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildWebhooks,
  ]
});
// ====================================================

// ==================== COLORS & EMBEDS ====================
const C = {
  primary:0x5865F2, success:0x57F287, warning:0xFEE75C,
  danger:0xED4245, info:0x5DADE2, boost:0xFF73FA,
  clone:0xFF7043, minor:0xE74C3C, purple:0x9B59B6
};
const mkEmbed = (title,desc,color=C.primary) =>
  new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color)
    .setTimestamp().setFooter({ text:'✨ SENSATIONAL Suite' });
const ok   = (t,d) => mkEmbed(`✅ ${t}`,d,C.success);
const err  = (t,d) => mkEmbed(`❌ ${t}`,d,C.danger);
const info = (t,d) => mkEmbed(`ℹ️ ${t}`,d,C.info);
const warn = (t,d) => mkEmbed(`⚠️ ${t}`,d,C.warning);
// =========================================================

// ==================== HELPERS ====================
const sleep = ms => new Promise(r => setTimeout(r, ms));

function checkMinor(text) {
  if (!text) return false;
  for (const p of MINOR_PATTERNS) {
    const m = text.match(p);
    if (m) { const age = parseInt(m[1]); return isNaN(age)||age<18; }
  }
  return false;
}

async function downloadFile(url, outputPath) {
  for (let i=0; i<MAX_RETRIES; i++) {
    try {
      const writer = fs.createWriteStream(outputPath);
      const res = await axios({ url, method:'GET', responseType:'stream', timeout:60000 });
      res.data.pipe(writer);
      await new Promise((resolve,reject) => { writer.on('finish',resolve); writer.on('error',reject); });
      const s = fs.statSync(outputPath);
      if (s.size<1024) { fs.unlinkSync(outputPath); throw new Error('Corrupted'); }
      return s.size;
    } catch(e) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (i===MAX_RETRIES-1) throw e;
      await sleep(3000);
    }
  }
}

async function sendPair(webhookUrl, filePaths) {
  for (let i=0; i<MAX_RETRIES; i++) {
    try {
      const form = new FormData();
      filePaths.forEach((fp,idx) => form.append(`files[${idx}]`, fs.createReadStream(fp)));
      await axios.post(webhookUrl, form, { headers:form.getHeaders(), maxContentLength:Infinity, maxBodyLength:Infinity, timeout:60000 });
      return;
    } catch(e) { if (i===MAX_RETRIES-1) throw e; await sleep(3000); }
  }
}

async function getWebhook(targetChannel) {
  const whs = await targetChannel.fetchWebhooks();
  let wh = whs.find(w=>w.name==='SENSATIONAL');
  if (!wh) { wh = await targetChannel.createWebhook({ name:'SENSATIONAL', avatar:WEBHOOK_AVATAR }); await sleep(500); }
  return wh.url;
}
// =================================================

// ==================== SLASH COMMANDS ====================
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('📖 Show all commands'),
  new SlashCommandBuilder().setName('stats').setDescription('📊 Server statistics'),

  // Selfbot token management
  new SlashCommandBuilder().setName('set-token')
    .setDescription('🔑 Set the user account token for cloning')
    .addStringOption(o=>o.setName('token').setDescription('Your Discord user token').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('token-status')
    .setDescription('🔍 Check selfbot login status')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('token-logout')
    .setDescription('🚪 Logout the selfbot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Minor Detection
  new SlashCommandBuilder().setName('addc').setDescription('🔍 Add channel to minor detection')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('delc').setDescription('🗑️ Remove channel from detection')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('list').setDescription('📋 List supervised channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('reqattach').setDescription('📎 Require attachments only')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('unreqattach').setDescription('🔓 Remove attachment requirement')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('attachlist').setDescription('📎 List media-only channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('modr').setDescription('🔔 Set minor alert ping role')
    .addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('logs').setDescription('📝 Set detection log channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('scan').setDescription('🔎 Scan supervised channels for minors')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('modstats').setDescription('📈 Moderator action statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Boost
  new SlashCommandBuilder().setName('boost-setrole').setDescription('🎁 Set booster reward role')
    .addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('boost-setfounder').setDescription('👑 Set permanent founder role')
    .addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('boost-setlog').setDescription('📢 Set boost log channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('boost-give').setDescription('🎀 Manually give boost role')
    .addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('boost-founder').setDescription('👑 Grant founder role')
    .addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  // Clone
  new SlashCommandBuilder().setName('clone-start').setDescription('🚀 Clone all media from source server')
    .addStringOption(o=>o.setName('source_id').setDescription('Source server ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('clone-structure').setDescription('🏗️ Clone categories & channels only')
    .addStringOption(o=>o.setName('source_id').setDescription('Source server ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('clone-nsfw').setDescription('🔞 Mark all channels 18+')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('clone-purge').setDescription('🧹 Delete text messages, keep media')
    .addChannelOption(o=>o.setName('channel').setDescription('Specific channel (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Account Management
  new SlashCommandBuilder().setName('account-status')
    .setDescription('🟢 Set selfbot online status and activity')
    .addStringOption(o=>o.setName('type').setDescription('Status type').setRequired(true)
      .addChoices({name:'Online',value:'online'},{name:'Idle',value:'idle'},{name:'Do Not Disturb',value:'dnd'},{name:'Invisible',value:'invisible'}))
    .addStringOption(o=>o.setName('activity').setDescription('Activity text (optional)').setRequired(false))
    .addStringOption(o=>o.setName('activity_type').setDescription('Activity type').setRequired(false)
      .addChoices({name:'Playing',value:'PLAYING'},{name:'Watching',value:'WATCHING'},{name:'Listening',value:'LISTENING'},{name:'Streaming',value:'STREAMING'}))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-bio')
    .setDescription('📝 Set selfbot account bio')
    .addStringOption(o=>o.setName('bio').setDescription('New bio text').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-pfp')
    .setDescription('🖼️ Set selfbot profile picture via image URL')
    .addStringOption(o=>o.setName('url').setDescription('Direct image URL').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-username')
    .setDescription('✏️ Change selfbot username')
    .addStringOption(o=>o.setName('username').setDescription('New username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-streamer')
    .setDescription('🎮 Toggle streamer mode on the selfbot account')
    .addBooleanOption(o=>o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-info')
    .setDescription('👤 Show selfbot account details')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-servers')
    .setDescription('🌐 List all servers the selfbot is in')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-leave')
    .setDescription('🚪 Make selfbot leave a server')
    .addStringOption(o=>o.setName('server_id').setDescription('Server ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('account-join')
    .setDescription('🔗 Make selfbot join a server via invite')
    .addStringOption(o=>o.setName('invite').setDescription('Invite code or full URL').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Selfbot Control
  new SlashCommandBuilder().setName('selfbot-clone')
    .setDescription('🌐 Clone entire server structure via invite — creates new server with exact layout + template')
    .addStringOption(o=>o.setName('invite').setDescription('Invite link or code (discord.gg/xxx)').setRequired(true))
    .addStringOption(o=>o.setName('server_name').setDescription('Name for the new server (default: Clone of X)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('selfbot-steal-nsfw')
    .setDescription('🔞 Steal NSFW media from source server → target server via webhooks')
    .addStringOption(o=>o.setName('source_id').setDescription('Source server ID — selfbot must be in this server').setRequired(true))
    .addStringOption(o=>o.setName('target_id').setDescription('Target server ID — selfbot must be in this server').setRequired(true))
    .addStringOption(o=>o.setName('category_id').setDescription('Category ID to steal from — selfbot must have access to it').setRequired(true))
    .addBooleanOption(o=>o.setName('rename').setDescription('Rename files to SENSATIONAL_N? (default: true)').setRequired(false))
    .addIntegerOption(o=>o.setName('pair_size').setDescription('Files per webhook message 1-10 (default: 2)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('selfbot-webhook-name')
    .setDescription('✏️ Set the webhook name used for all media uploads')
    .addStringOption(o=>o.setName('name').setDescription('New webhook name').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('selfbot-webhook-pfp')
    .setDescription('🖼️ Set the webhook avatar used for all media uploads')
    .addStringOption(o=>o.setName('url').setDescription('Direct image URL for avatar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('selfbot-webhook-info')
    .setDescription('🔍 Show current webhook name and avatar settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Templates
  new SlashCommandBuilder().setName('template-save').setDescription('💾 Save server layout as template')
    .addStringOption(o=>o.setName('name').setDescription('Template name').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('template-list').setDescription('📂 List saved templates')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('template-load').setDescription('📥 Apply a saved template')
    .addStringOption(o=>o.setName('name').setDescription('Template name').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('template-delete').setDescription('🗑️ Delete a template')
    .addStringOption(o=>o.setName('name').setDescription('Template name').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map(c=>c.toJSON());
// ========================================================

// ==================== TOKEN HANDLERS ====================
async function handleSetToken(i) {
  // Ephemeral so the token is never visible to others
  await i.deferReply({ ephemeral: true });
  const token = i.options.getString('token');

  await i.editReply({ embeds:[info('Logging in...','Connecting selfbot, please wait...')] });

  try {
    const tag = await loginSelfbot(token);
    await i.editReply({ embeds:[ok('Selfbot Connected',`👤 Logged in as **${tag}**\nToken saved — cloning is now available!`)] });
  } catch(e) {
    await i.editReply({ embeds:[err('Login Failed', `\`${e.message}\`\n\nMake sure the token is valid and the account is not locked.`)] });
  }
}

async function handleTokenStatus(i) {
  const db = loadDB();
  const hasToken = !!db._userToken;
  const status = getSelfbotStatus();
  await i.reply({
    embeds:[info('🔑 Selfbot Status',
      `**Status:** ${status}\n**Saved token:** ${hasToken ? '✅ Yes' : '❌ None'}\n\nUse \`/set-token\` to login.`
    )],
    ephemeral: true
  });
}

async function handleTokenLogout(i) {
  if (self) { try { self.destroy(); } catch(_){} self = null; }
  const db = loadDB();
  delete db._userToken;
  saveDB(db);
  await i.reply({ embeds:[ok('Logged Out','Selfbot has been disconnected and token cleared.')], ephemeral:true });
}
// ========================================================

// ==================== CLONE INTERNALS ====================
async function cloneStructureInternal(sourceGuild, targetGuild) {
  const channelMap = new Map();
  await sourceGuild.channels.fetch();
  await targetGuild.channels.fetch();

  const cats = [...sourceGuild.channels.cache.values()]
    .filter(c=>c.type==='GUILD_CATEGORY').sort((a,b)=>a.position-b.position);
  for (const cat of cats) {
    let tCat = targetGuild.channels.cache.find(c=>c.name===cat.name&&c.type==='GUILD_
