const discord = require("discord.js");
const logger = require("../modules/logger")
exports.run = async (client, interaction) => { // eslint-disable-line no-unused-vars
  await interaction.deferReply({ ephemeral: true });

  let requester = interaction.user
  let message = interaction.targetMessage;

  let content = createContent(message)
                  .replace("\n\n","\n") // clear extra lines

  let embeds = message.embeds != null && message.embeds.length > 0 ? Array.from(message.embeds?.values()) : null;
  embeds = embeds?.filter(element => element.description != null);

  await requester.dmChannel.send(
    {
      content: content,
      embeds: embeds
    });

  logger.log(`[${message.author.tag}] used [DM this to me] [guild id]: ${interaction.guildId} [message id] ${message.id}`)
  await interaction.editReply("DM sent.");
};

function createContent(message){
  let attachments = message.attachments != null && message.attachments.length > 0? Array.from(message.attachments.map(x=>x.proxyURL)).join("\n") : null;
  let files = message.files != null&& message.files.length > 0 ? Array.from(message.files.map(x=>x.proxyURL)).join("\n") : null;
  let content = `Sent by: ${message.author}. MessageId: ${message.id}.\n${message.content}`

  if(files != null){
    content += "\n"+files
  }
  if(attachments != null){
    content += "\n"+attachments
  }
}

exports.commandData = {
  name: "DM This To Me",
  //description: "Shows nick history of the user. Uses nicklog channel as a database.",
  options: [],
  defaultPermission: true,
  type: 3//ApplicationCommandTypes.USER
};

// Set guildOnly to true if you want it to be available on guilds only.
// Otherwise false is global.
exports.conf = {
  permLevel: "User",
  guildOnly: true
};