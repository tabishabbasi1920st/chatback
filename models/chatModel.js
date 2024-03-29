const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const chatSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    required: true,
    unique: true,
  },
  newMessage: {
    type: String,
    required: true,
  },
  dateTime: {
    type: Date,
    default: Date.now,
    required: true,
  },
  sentBy: {
    type: String,
    required: true,
  },
  sentTo: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  delieveryStatus: {
    type: String,
    required: true,
  },
});

const ChatMessage = mongoose.model("chattings", chatSchema);

module.exports = ChatMessage;
