require('dotenv').config();
const keepAlive = require('./keep_alive');
keepAlive();
const { Client, Intents, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

const PREFIXES = ['!', '!t']; // Multiple prefixes for commands
const STAFF_ROLE_ID = '1226167494226608198';
const TRIAL_STAFF_ROLE_ID = '1226166868952350721';
const TRANSCRIPT_CHANNEL_ID = '1258805318687916043';
const NON_VERIFIED_ROLE_ID = '1200771376592736256';
const CATEGORY_ID = '1200479535032959128'; // Category ID for tickets

const openTickets = new Map(); // Store open tickets per user

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ticket' || command === 't') {
    const subcommand = args.shift().toLowerCase();
    if (subcommand === 'setup') {
      const channelId = args[0];
      const channel = message.guild.channels.cache.get(channelId);
      if (!channel) {
        return message.reply('Invalid channel ID!');
      }

      const embed = new MessageEmbed()
        .setTitle('FLOW Support')
        .setDescription('## __Welcome to this support panel!__\n\n**Click on the button below to create a ticket, staff team will respond to your request**\n## `/report` to report a user')
        .setThumbnail('https://media.discordapp.net/attachments/470983675157151755/1251585397738176613/0KejAlR.png?ex=6698a47c&is=669752fc&hm=db4b3728c8238a9c9ce11990b68128ff45335666211fb941421689e0abd188f6&=&format=webp&quality=lossless')
        .setColor('#00FF00')
        .setFooter('FLOW Support | Discord.gg/flw')
        .setTimestamp();

      const row = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setCustomId('create_ticket')
            .setLabel('Create a Ticket')
            .setStyle('DANGER')
            .setEmoji('<a:FLOW_redverify:1201217589737693234>')
        );

      await channel.send({ embeds: [embed], components: [row] });
      message.reply(`Ticket setup embed sent to <#${channelId}>.`);
    } else if (subcommand === 'add') {
      const userId = args[0];
      const user = await message.guild.members.fetch(userId).catch(() => null);
      if (!user) {
        return message.reply('Invalid user ID!');
      }

      const ticketChannel = message.channel;
      ticketChannel.permissionOverwrites.edit(userId, {
        VIEW_CHANNEL: true,
        SEND_MESSAGES: true,
      });

      message.reply(`User <@${userId}> has been added to the ticket.`);
    } else if (subcommand === 'remove') {
      const userId = args[0];
      const user = await message.guild.members.fetch(userId).catch(() => null);
      if (!user) {
        return message.reply('Invalid user ID!');
      }

      const ticketChannel = message.channel;
      ticketChannel.permissionOverwrites.edit(userId, {
        VIEW_CHANNEL: false,
        SEND_MESSAGES: false,
      });

      message.reply(`User <@${userId}> has been removed from the ticket.`);
    } else if (subcommand === 'close') {
      if (!message.member.roles.cache.has(STAFF_ROLE_ID) && !message.member.roles.cache.has(TRIAL_STAFF_ROLE_ID)) {
        return message.reply('Only staff members can close tickets.');
      }

      const ticketChannel = message.channel;
      closeTicket(ticketChannel, message.member);
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'create_ticket') {
    if (interaction.member.roles.cache.has(NON_VERIFIED_ROLE_ID)) {
      return interaction.reply({ content: 'You must be verified to create a ticket.', ephemeral: true });
    }

    if (openTickets.has(userId)) {
      return interaction.reply({ content: 'You already have an open ticket. Please close your current ticket before creating a new one.', ephemeral: true });
    }

    const ticketChannel = await interaction.guild.channels.create(`ticket-${interaction.user.username}`, {
      type: 'GUILD_TEXT',
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: ['VIEW_CHANNEL'],
        },
        {
          id: interaction.user.id,
          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
        },
        {
          id: STAFF_ROLE_ID,
          allow: ['VIEW_CHANNEL'],
        },
        {
          id: TRIAL_STAFF_ROLE_ID,
          allow: ['VIEW_CHANNEL'],
        },
      ],
    });

    openTickets.set(userId, ticketChannel.id);

    await ticketChannel.send({
      content: `Hey <@${interaction.user.id}>, welcome to your ticket! Please wait for <@&${STAFF_ROLE_ID}> or <@&${TRIAL_STAFF_ROLE_ID}> to assist you.`,
    });

    const embed = new MessageEmbed()
      .setDescription(`Ticket created by ${interaction.user}\n\nUse the buttons below to claim or close the ticket.`)
      .setColor('#00FF00');

    const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
          .setCustomId('claim_ticket')
          .setLabel('Claim Ticket')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle('DANGER')
          .setDisabled(true) // Initially disabled until claimed
      );

    await ticketChannel.send({ embeds: [embed], components: [row] });

    interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
  } else if (interaction.customId === 'claim_ticket') {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !interaction.member.roles.cache.has(TRIAL_STAFF_ROLE_ID)) {
      return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
    }

    const ticketChannel = interaction.channel;

    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const message = messages.find(msg => msg.embeds.length > 0 && msg.embeds[0].description.includes('Ticket created by'));

    if (!message) {
      return interaction.reply({ content: 'Failed to find the embed. Please try again.', ephemeral: true });
    }

    const embed = message.embeds[0];
    embed.setDescription(`${embed.description}\n\nClaimed by ${interaction.user}`);

    const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
          .setCustomId('claim_ticket')
          .setLabel('Claim Ticket')
          .setStyle('PRIMARY')
          .setDisabled(true),
        new MessageButton()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle('DANGER')
          .setDisabled(false) // Enable closing after claiming
      );

    await message.edit({ embeds: [embed], components: [row] });

    ticketChannel.permissionOverwrites.edit(interaction.member, {
      SEND_MESSAGES: true,
    });

    interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { VIEW_CHANNEL: false });
    interaction.channel.permissionOverwrites.edit(interaction.member, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
    interaction.channel.permissionOverwrites.edit(STAFF_ROLE_ID, { VIEW_CHANNEL: false });
    interaction.channel.permissionOverwrites.edit(TRIAL_STAFF_ROLE_ID, { VIEW_CHANNEL: false });

    interaction.reply({ content: `Ticket claimed by ${interaction.user}`, ephemeral: true });
  } else if (interaction.customId === 'close_ticket') {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !interaction.member.roles.cache.has(TRIAL_STAFF_ROLE_ID)) {
      return interaction.reply({ content: 'Only staff members can close tickets.', ephemeral: true });
    }

    const ticketChannel = interaction.channel;
    closeTicket(ticketChannel, interaction.member);
  }
});

async function closeTicket(ticketChannel, member) {
  const userId = Array.from(openTickets.entries()).find(([key, value]) => value === ticketChannel.id)?.[0];
  ticketChannel.messages.fetch().then(async messages => {
    const transcriptPath = await generateTranscript(messages, ticketChannel);

    const transcriptChannel = ticketChannel.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    await transcriptChannel.send({
      content: `**📁 Ticket Closed**\n**Channel Name:** ${ticketChannel.name}\n**Creator:** <@${userId}>\n**Closed By:** <@${member.id}>\n\n**Transcript:** To view the transcript, download and view the html file.`,
      files: [transcriptPath],
    });

    if (userId) openTickets.delete(userId);
    ticketChannel.delete();
  });
}

async function generateTranscript(messages, channel) {
  const messagesArray = Array.from(messages.values());
  messagesArray.reverse(); // To have messages in chronological order

  let html = `
  <html>
  <head>
    <title>Transcript for ${channel.name}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #36393f;
        color: #dcddde;
      }
      .message {
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 5px;
      }
      .message .author {
        font-weight: bold;
      }
      .message .time {
        font-size: 0.9em;
        color: #72767d;
      }
      .message img {
        max-width: 400px;
        border-radius: 5px;
      }
      .message .reaction {
        display: inline-block;
        margin-right: 5px;
      }
    </style>
  </head>
  <body>
  `;

  for (const message of messagesArray) {
    const author = message.author.tag;
    const avatar = message.author.displayAvatarURL();
    const content = message.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const timestamp = message.createdAt.toLocaleString();
    const attachments = message.attachments.map(attachment => `<img src="${attachment.url}" alt="Attachment">`).join('');
    const reactions = message.reactions.cache.map(reaction => `<span class="reaction">${reaction.emoji.name} ${reaction.count}</span>`).join(' ');

    html += `
    <div class="message">
      <img src="${avatar}" alt="${author}'s avatar" style="width: 40px; height: 40px; float: left; margin-right: 10px;">
      <div>
        <span class="author">${author}</span>
        <span class="time">${timestamp}</span>
        <div class="content">${content}</div>
        ${attachments}
        <div class="reactions">${reactions}</div>
      </div>
    </div>
    `;
  }

  html += `
  </body>
  </html>
  `;

  const transcriptPath = path.join(__dirname, `transcript-${channel.name}.html`);
  fs.writeFileSync(transcriptPath, html);

  return transcriptPath;
}

client.login(process.env.DISCORD_TOKEN);
