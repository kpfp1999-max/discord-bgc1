const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Load your bgc command
const bgc = require('./bgc.js');
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'bgc') {
    await bgc.execute(interaction);
  }
});

// Log in with your bot token
client.login('client.login(process.env.DISCORD_TOKEN);');
