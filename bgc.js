// bgc.js

// --- Express server (keeps Render alive) ---
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// --- Discord.js setup ---
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  Collection,
  REST,
  Routes
} = require('discord.js');

// Node 18+ has global fetch. If not, use node-fetch dynamically.
const fetch =
  global.fetch ||
  ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

// Create the Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- /bgc command (your logic) ---
const bgcCommand = {
  data: new SlashCommandBuilder()
    .setName('bgc')
    .setDescription('Background check a Roblox user')
    .addStringOption(opt =>
      opt
        .setName('username')
        .setDescription('Roblox username')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.reply({ content: '🔎 Fetching Roblox data…', ephemeral: false });

    try {
      const username = interaction.options.getString('username');

      // --- Resolve user ID ---
      const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username] })
      });
      const userJson = await userRes.json();
      if (!userJson.data?.length) {
        return interaction.editReply(`❌ Could not find Roblox user **${username}**`);
      }
      const userId = userJson.data[0].id;

      // --- Fetch profile & counts in parallel ---
      const [
        info,
        friendsJson,
        followersJson,
        followingJson,
        invJson,
        avatarJson,
        groupsJson
      ] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).then(r => r.json()),
        fetch(`https://inventory.roblox.com/v1/users/${userId}/can-view-inventory`).then(r => r.json()),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`).then(r => r.json()),
        fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`).then(r => r.json())
      ]);

      const friendsCount = friendsJson.count ?? 0;
      const followersCount = followersJson.count ?? 0;
      const followingCount = followingJson.count ?? 0;
      const inventoryPublic = Boolean(invJson.canViewInventory);
      const avatarUrl = avatarJson.data?.[0]?.imageUrl || null;

      // --- Groups summary + key/blacklist matching ---
      const groups = Array.isArray(groupsJson.data) ? groupsJson.data : [];
      const totalGroups = groups.length;

      const importantGroupIds = [
        34808935, 34794384, 35250103, 35335293, 5232591,
        34899357, 34815613, 35586073, 34815619, 35678586, 35536880
      ];
      const matchedKeyGroups = groups
        .filter(g => importantGroupIds.includes(Number(g.group.id)))
        .map(g => `${g.group.name} — ${g.role?.name ?? 'Member'}`);

      const blacklistedGroupIds = [35675627, 35853828];
      const matchedBlacklisted = groups
        .filter(g => blacklistedGroupIds.includes(Number(g.group.id)))
        .map(g => `${g.group.name} — ${g.role?.name ?? 'Member'}`);

      // --- Initial embed ---
      let embed = new EmbedBuilder()
        .setTitle(`${info.name} (@${info.displayName})`)
        .setThumbnail(avatarUrl)
        .setDescription(info.description || 'No bio set.')
        .addFields(
          { name: 'Roblox ID', value: String(userId), inline: true },
          { name: 'Account Created', value: new Date(info.created).toDateString(), inline: true },
          { name: 'Banned', value: info.isBanned ? 'Yes' : 'No', inline: true },
          { name: 'Inventory Public', value: inventoryPublic ? 'Yes' : 'No', inline: true },
          { name: 'Friends', value: String(friendsCount), inline: true },
          { name: 'Followers', value: String(followersCount), inline: true },
          { name: 'Following', value: String(followingCount), inline: true },
          { name: 'Total Groups', value: String(totalGroups), inline: true },
          {
            name: 'Key Groups',
            value: matchedKeyGroups.length ? matchedKeyGroups.join('\n') : 'None',
            inline: false
          },
          {
            name: 'Blacklisted Groups',
            value: matchedBlacklisted.length ? matchedBlacklisted.join('\n') : 'None',
            inline: false
          }
        )
        .setColor(0x00AE86);

      await interaction.editReply({ content: '', embeds: [embed] });

      // --- Fetch all badges ---
      let allBadges = [];
      let cursor = '';
      do {
        const res = await fetch(
          `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`
        );
        const page = await res.json();
        if (!page.data) break;
        allBadges.push(...page.data);
        cursor = page.nextPageCursor;
      } while (cursor);

      const totalBadges = allBadges.length;
      const suspectedCount = allBadges.filter(b => {
        const lower = (b.name || '').toLowerCase();
        return lower.includes('free') || lower.includes('badge');
      }).length;
      const adjustedBadgeTotal = Math.max(0, totalBadges - suspectedCount);

      const fields = embed.data.fields || [];
      const setField = (name, value, inline = true) => {
        const idx = fields.findIndex(f => f.name === name);
        if (idx >= 0) fields[idx].value = value;
        else fields.push({ name, value, inline });
      };

      setField('Total badges', String(totalBadges));
      setField('Suspected bot badge', String(suspectedCount));
      setField('Total badges (adjusted)', String(adjustedBadgeTotal));

      embed.data.fields = fields;
      await interaction.editReply({ embeds: [embed] });

      console.log(
        `✅ /bgc ${username}: groups=${totalGroups}, keys=${matchedKeyGroups.length}, blacklisted=${matchedBlacklisted.length}`
      );
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ An error occurred while fetching data.');
    }
  }
};

// --- Command collection & handlers ---
client.commands = new Collection();
client.commands.set(bgcCommand.data.name, bgcCommand);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const replyContent = { content: '❌ There was an error executing this command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(replyContent);
    } else {
      await interaction.reply(replyContent);
    }
  }
});

// --- Register commands in two guilds (instant availability) ---
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    const commands = [bgcCommand.data.toJSON()];

    const guildIds = [
      process.env.GUILD_ID_1, // e.g., '123456789012345678'
      process.env.GUILD_ID_2  // e.g., '234567890123456789'
    ].filter(Boolean);

    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
      );
      console.log(`✅ Registered commands in guild ${guildId}`);
    }

    // Optional: also register globally (takes up to ~1 hour to propagate)
    // await rest.put(
    //   Routes.applicationCommands(process.env.CLIENT_ID),
    //   { body: commands }
    // );
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
})();

// --- Login the bot ---
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Login failed:', err);
});
