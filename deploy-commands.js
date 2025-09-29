const { REST, Routes } = require('discord.js');
const fs = require('fs');

// Load your bot token, client ID, and guild ID
const token = 'client.login(process.env.DISCORD_TOKEN);';
const clientId = '1422249941799276755'; // from Discord Developer Portal
const guildId = '1421400830870818870'; // right-click your server > Copy ID (enable Developer Mode in Discord settings first)

// Grab all command files
const commands = [];
const commandFiles = fs.readdirSync('./').filter(file => file.endsWith('.js') && file !== 'index.js' && file !== 'deploy-commands.js');

for (const file of commandFiles) {
  const command = require(`./${file}`);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(token);

// Register commands for your test server (instant sync)
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
