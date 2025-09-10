import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, CommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { storage } from './storage';
import type { InsertLead } from '@shared/schema';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

// Lead capture command
const leadCommand = new SlashCommandBuilder()
  .setName('lead')
  .setDescription('Start the lead capture process for vehicle sales');

client.once('ready', async () => {
  console.log(`Discord bot is ready! Logged in as ${client.user?.tag}`);
  
  // Register slash commands
  try {
    await client.application?.commands.create(leadCommand);
    console.log('Slash commands registered successfully');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
});

async function handleSlashCommand(interaction: CommandInteraction) {
  if (interaction.commandName === 'lead') {
    const modal = new ModalBuilder()
      .setCustomId('lead_capture_modal')
      .setTitle('Vehicle Sales Lead Information');

    // Create text input components for each field
    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Full Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your full name')
      .setRequired(true)
      .setMaxLength(100);

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel('Email Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your email address')
      .setRequired(true)
      .setMaxLength(100);

    const phoneInput = new TextInputBuilder()
      .setCustomId('phone_number')
      .setLabel('Phone Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your phone number')
      .setRequired(true)
      .setMaxLength(20);

    const budgetInput = new TextInputBuilder()
      .setCustomId('budget')
      .setLabel('Budget Range')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., $20,000 - $30,000')
      .setRequired(true)
      .setMaxLength(50);

    const vehicleInput = new TextInputBuilder()
      .setCustomId('vehicle_wanted')
      .setLabel('Vehicle Wanted')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe the type of vehicle you are looking for')
      .setRequired(true)
      .setMaxLength(500);

    // Create action rows for each input
    const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
    const emailRow = new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput);
    const phoneRow = new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput);
    const budgetRow = new ActionRowBuilder<TextInputBuilder>().addComponents(budgetInput);
    const vehicleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(vehicleInput);

    modal.addComponents(nameRow, emailRow, phoneRow, budgetRow, vehicleRow);

    await interaction.showModal(modal);
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId === 'lead_capture_modal') {
    try {
      // Extract form data
      const leadData: InsertLead = {
        name: interaction.fields.getTextInputValue('name'),
        email: interaction.fields.getTextInputValue('email'),
        phoneNumber: interaction.fields.getTextInputValue('phone_number'),
        budget: interaction.fields.getTextInputValue('budget'),
        vehicleWanted: interaction.fields.getTextInputValue('vehicle_wanted'),
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
      };

      // Save to storage
      const savedLead = await storage.createLead(leadData);

      // Create confirmation embed
      const embed = new EmbedBuilder()
        .setTitle('✅ Lead Information Captured!')
        .setDescription('Thank you for providing your information. A sales representative will contact you soon.')
        .addFields(
          { name: '👤 Name', value: leadData.name, inline: true },
          { name: '📧 Email', value: leadData.email, inline: true },
          { name: '📞 Phone', value: leadData.phoneNumber, inline: true },
          { name: '💰 Budget', value: leadData.budget, inline: true },
          { name: '🚗 Vehicle Wanted', value: leadData.vehicleWanted, inline: false },
          { name: '🆔 Lead ID', value: savedLead.id, inline: true }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Send lead data to Discord webhook for Zapier integration
      await sendLeadToWebhook(savedLead);
      
      console.log('New lead captured:', savedLead);

    } catch (error) {
      console.error('Error saving lead:', error);
      await interaction.reply({
        content: '❌ There was an error saving your information. Please try again.',
        ephemeral: true
      });
    }
  }
}

// Send lead data to Discord webhook for Zapier integration
async function sendLeadToWebhook(leadData: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('DISCORD_WEBHOOK_URL not configured, skipping webhook send');
    return;
  }

  try {
    const payload = {
      content: `🚗 **NEW VEHICLE SOURCING LEAD**
NAME: ${leadData.name}
EMAIL: ${leadData.email}
PHONE: ${leadData.phoneNumber}
VEHICLE: ${leadData.vehicleWanted}
BUDGET: ${leadData.budget}
DETAILS: Lead captured via Discord Bot
LEADID: ${leadData.id}
SOURCE: Discord Bot
DATE: ${new Date(leadData.createdAt).toISOString()}
DISCORDUSER: ${leadData.discordUsername}`,
      embeds: [{
        title: "🚗 New Vehicle Sourcing Lead",
        color: 0xD4AF37, // Gold color
        fields: [
          {
            name: "👤 Name",
            value: leadData.name,
            inline: true
          },
          {
            name: "📧 Email", 
            value: leadData.email,
            inline: true
          },
          {
            name: "📱 Phone Number",
            value: leadData.phoneNumber,
            inline: true
          },
          {
            name: "🚙 Vehicle Wanted",
            value: leadData.vehicleWanted,
            inline: false
          },
          {
            name: "💰 Budget Range", 
            value: leadData.budget,
            inline: true
          },
          {
            name: "📝 Additional Details",
            value: "Lead captured via Discord Bot",
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: "Springers Vehicle Sourcing | Lead Source: Discord Bot"
        }
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log('Lead data sent to Discord webhook successfully');
  } catch (error) {
    console.error('Error sending lead to Discord webhook:', error);
  }
}

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

export async function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN environment variable is required');
  }

  try {
    await client.login(token);
  } catch (error) {
    console.error('Failed to start Discord bot:', error);
    throw error;
  }
}

export { client };
