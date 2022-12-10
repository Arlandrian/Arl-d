const logger = require("../modules/logger.js");
const { LiveChat } = require("youtube-chat")
const youtubeService = require("./youtubeService");
const { youtube } = require("googleapis/build/src/apis/youtube/index.js");
const db = { getYoutubeBotConfig, setYoutubeBotConfig } = require("../modules/database.js")

const defaultBotConfig = {
  enabled: false,
  channelId: null,
  messageText: null,
  messageFreqSec: 120
}

let botConfig = {
  enabled: false,
  channelId: null,
  messageText: null,
  messageFreqSec: 120
}

//Enum
const StreamStatus = {
  OnAir: "OnAir",
  OffAir: "OffAir"
}

let liveChat = null

let streamStatus = StreamStatus.OffAir;
let working = false;
let currentLiveStreamId = null
let currentLiveChatId = null
let lastMessageSendDate = new Date()

initLiveChatConfig()

const StartMainLoop = async () => {
  working = true
  logger.log("Started youtube bot with config: "+JSON.stringify(botConfig))
  while (working) {
    await new Promise(r => setTimeout(r, 5000));
    switch (streamStatus) {
      case StreamStatus.OffAir:
        await OffAirState();
        break;
      case StreamStatus.OnAir:
        await OnAirState()
        break;
    }
  }
}

const StopMainLoop = () => {
  working = false
}

const OnAirState = async () => {
  let timePassedSec = (new Date() - lastMessageSendDate) / 1000
  if(timePassedSec > botConfig.messageFreqSec){
    await sendChatMessage(botConfig.messageText)
  }
}

const sendChatMessage = async (msg) => {
  if(currentLiveChatId == null){
    if(currentLiveStreamId == null){
      return
    }
    currentLiveChatId = await youtubeService.getActiveLiveChatId(currentLiveStreamId)
  }

  let response = await youtubeService.sendLiveChatMessage(currentLiveChatId, msg)
  if(response!= null && response.error == 'The specified live chat is no longer live.'){
    onStreamEnded()
    return
  }
  
  if(response!= null && response.error == 'The caller does not have permission'){
    logger.error("We are banned, yaaay")
    logger.error("Deactivating the live chat watch.")
    toggleLiveChat()
    return
  }
  lastMessageSendDate = new Date()
  logger.log(`[${lastMessageSendDate}] Sending chat message...`)
}

const OffAirState = async () => {
  let didFoundStream = await liveChat.start()
}

const onStreamEnded = () => {
  streamStatus = StreamStatus.OffAir
  currentLiveStreamId = null
  currentLiveChatId = null
}

const initLiveChatEvents = async () => {
  // Emit at start of observation chat.
  // liveId: string
  liveChat.on("start", (liveId) => {
    /* Your code here! */
    logger.log("live stream started: " + liveId)
    streamStatus = StreamStatus.OnAir;
    currentLiveStreamId = liveId
    liveChat.stop("no need to watch chat")
  })

  // Emit at end of observation chat. // ONLY CHAT
  // reason: string?
  liveChat.on("end", (reason) => {
    /* Your code here! */
    logger.log("stopped watching chat. reason: " + reason)
  })

  // Emit at receive chat.
  // chat: ChatItem
  // liveChat.on("chat", (chatItem) => {
  //   /* Your code here! */
  //   // logger.log(chatItem.message)
  // })

  // Emit when an error occurs
  // err: Error or any
  liveChat.on("error", (err) => {
    /* Your code here! */
    if(err.message == "Live Stream was not found"){
      // this is expected
      if(streamStatus == StreamStatus.OnAir)
      {
        logger.error("stopping live chat bot.")
        onStreamEnded()
      }
      return;
    }

    if(err.message == "Cannot read properties of undefined (reading '0')")
    {
      logger.error(err)
      if(streamStatus == StreamStatus.OnAir){
        logger.error("stopping live chat bot.")
        onStreamEnded()
        return;
      }
    }

    if(err.message == "Request failed with status code 404"){
      // this is expected
      if(streamStatus == StreamStatus.OnAir)
      {
        logger.error("stopping live chat bot.")
        onStreamEnded()
        return;
      }
    }

    if(err.message.endsWith("is finished live")){
      // this is expected
      if(streamStatus == StreamStatus.OnAir)
      {
        logger.error("stopping live chat bot.")
        onStreamEnded()
        return;
      }
    }

    logger.error(err)
  })
}

async function initLiveChatConfig (){
  let config = await db.getYoutubeBotConfig()
  if(config == null){
    await db.setYoutubeBotConfig(defaultBotConfig)
    config = JSON.parse(JSON.stringify(defaultBotConfig))
  }
  botConfig = config
  if(botConfig.enabled){
    let resp = await toggleLiveChat()
    if(resp.error != undefined){
      const reply = `Live chat bot toggle failed. Error: ${resp.error}`
      logger.error(reply)
      return;
    }
  }
}

const startLiveChat = async () => {
  if(working){
    return {error:"Live chat bot already working."}
  }

  if(botConfig.channelId == null){
    botConfig = await db.getYoutubeBotConfig()
    if(botConfig == null){
      await initLiveChatConfig()
    }
  }

  if(botConfig.channelId == null){
    return {error:"Channel Id is not set, use ytsetchannelid your-channel-id"}
  }

  if(botConfig.messageText == null){
    return {error:"Chat Message is not set, use ytsetmessage your-message"}
  }

  if(!youtubeService.validateChannelId(botConfig.channelId))
  {
    return {error:`Channel id \"${botConfig.channelId}\" could not found.`}
  }

  liveChat = new LiveChat({channelId: botConfig.channelId}, 1000000000)// interval is for live chat
  initLiveChatEvents()
  /*DONT AWAIT await*/ StartMainLoop()
  return {}
}

const stopLiveChat = async () => {
  if(!working){
    return {error:"Live chat bot is not working."}
  }
  StopMainLoop();
  liveChat.stop("Command");
  logger.log("Live chat bot stopped.")
  return {}
}

const getLiveChatMessage = async () => {
  return botConfig.messageText
}

const setLiveChatMessage = async (textMessage) => {
  botConfig.messageText = textMessage
  await db.setYoutubeBotConfig(botConfig)
}

const getLiveChatFreqSec = async () => {
  return botConfig.messageFreqSec
}

const setLiveChatFreqSec = async (freq) => {
  botConfig.messageFreqSec = freq
  await db.setYoutubeBotConfig(botConfig)
}

const getLiveChatChannelId = async () => {
  return botConfig.channelId
}

const setLiveChatChannelId = async (channelId) => {
  if(botConfig.channelId == channelId){
    return {error:"ChannelId is already "+channelId}
  }

  if(!await youtubeService.validateChannelId(channelId)){
    return {error: `Channel id \"${channelId}\" could not found.`}
  }

  botConfig.channelId = channelId
  await db.setYoutubeBotConfig(botConfig)

  if(working){
    await stopLiveChat();
    await startLiveChat();
  }
}

const toggleLiveChat = async () =>{
  if(working){
    let result = {
      error: (await stopLiveChat()).error,
      working: working
    }
    if(!result.error){
      botConfig.enabled = false
      await db.setYoutubeBotConfig(botConfig)
    }
    return result;
  }else{
    let result = {
      error: (await startLiveChat()).error,
      working: working
    }
    if(!result.error){
      botConfig.enabled = true
      await db.setYoutubeBotConfig(botConfig)
    }
    return result;
  }
}

module.exports = { 
  toggleLiveChat,
  getLiveChatMessage, setLiveChatMessage,
  getLiveChatFreqSec, setLiveChatFreqSec,
  getLiveChatChannelId, setLiveChatChannelId
};
