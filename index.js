require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { hash, compare } = require("bcrypt");
const { sign, verify } = require("jsonwebtoken");
const mongoose = require("mongoose");
const LoginOrRegisterModel = require("./models/loginOrRegisterModel");
const UserModel = require("./models/userModel");
const ChatMessage = require("./models/chatModel");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();

// middlewares
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'uploads' directory
app.use("/uploads", express.static("uploads"));
app.use("/uploads_audio", express.static("uploads_audio"));
app.use("/reg_users", express.static("reg_users"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ],
    methods: ["GET", "POST"],
  },
});

// Connect to mongodb atlas.
const MONGODB_URI = process.env.MONGODB_URI;

const connectDb = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connection successful to DB");
  } catch (error) {
    console.error("Database connection failed");
    process.exit(0);
  }
};

connectDb();

// Token Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers;
  let chatToken;
  if (authHeader != undefined) {
    chatToken = authHeader["authorization"].split(" ")[1];
  }
  if (chatToken === undefined) {
    res.status(401);
    res.send({ message: "Unauthorized user" });
  } else {
    verify(chatToken, process.env.SECRET_KEY, (err, payload) => {
      if (err) {
        res.status(401);
        res.send("Unauthorized user");
      } else {
        req.email = payload.email;
      }
      next();
    });
  }
};

// Register user Api
app.post("/register", async (req, res) => {
  const { name, email, password, img } = req.body;

  // Convert base 64 image data to buffer
  const imageBuffer = Buffer.from(img, "base64");

  // Save the buffer to a file in your desired location
  fs.writeFileSync(`reg_users/${email}_profile_image.png`, imageBuffer);

  try {
    const { name, email, password } = req.body;
    const hashedPassword = await hash(password, 10);

    const newUser = new LoginOrRegisterModel({
      name,
      email,
      password: hashedPassword,
      imageUrl: `reg_users/${email}_profile_image.png`,
    });

    const savedUser = await newUser.save();
    console.log("User inserted into 'chatUser' collection:", savedUser);
    res.status(201).json(savedUser);
  } catch (err) {
    console.log("Error in registering user : ", err);
    if (err.code === 11000) {
      // Duplicate key error (e.g., duplicate email)
      return res.status(400).json({ message: "Email already exists" });
    } else {
      res.status(500).json({ message: "Failed to register user" });
    }
  }
});

//  Login User API
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await LoginOrRegisterModel.find({ email });
  // user will be in a list

  if (user.length === 0) {
    res.status(400);
    res.send({ message: "Invalid User." });
  } else {
    const isPasswordMatched = await compare(password, user[0].password);
    if (isPasswordMatched) {
      const payload = { email };
      const jwtToken = sign(payload, process.env.SECRET_KEY);
      res.status(200);
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send({ message: "Invalid Password" });
    }
  }
});

// all chats api
app.post("/all-chats", async (req, res) => {
  const { user } = req.body;
  console.log(user);
  try {
    const allChats = await UserModel.find({ email: { $ne: user } });
    res.status(200);
    res.json({ allChats });
  } catch (err) {
    console.log("Error while fetching all chats:", err);
  }
});

// profile-info api
app.get("/user-info", authenticateToken, async (req, res) => {
  try {
    const { email } = req;
    const user = await UserModel.find({ email });
    if (user.length === 0) {
      res.status(400);
      res.send({ message: "Something went wrong" });
    } else {
      res.status(200);
      res.send({ message: user });
    }
  } catch (err) {
    console.log("Error while  getting the user info : ", err);
  }
});

// my-chats api
app.get("/my-chats", async (req, res) => {
  const { me, to } = req.query;

  try {
    const messages = await ChatMessage.find({
      $or: [
        { sentBy: me, sentTo: to },
        { sentBy: to, sentTo: me },
      ],
    }).sort({ dateTime: 1 });

    res.status(200);
    res.json(messages);
  } catch (err) {
    console.log("Error while fetching  my chat list : ", err);
  }
});

const connectedUsers = {};

// user status api.
app.get("/user-status", (req, res) => {
  const { user } = req.query;
  const isOnline = connectedUsers[user] ? true : false;
  return res.json({ isOnline });
});

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("setEmail", (email) => {
    // add user to the list of connected users
    connectedUsers[email] = socket.id;
  });

  console.log(connectedUsers);

  socket.on("privateImage", async (msg, callback) => {
    try {
      const { id, newMessage, dateTime, sentBy, sentTo, type } = msg;
      const { uploaded_image } = newMessage;

      // Convert base 64 image data to buffer
      const imageBuffer = Buffer.from(uploaded_image, "base64");

      // Save the buffer to a file.
      fs.writeFileSync(`uploads/img_${id}.png`, imageBuffer);

      const newImage = new ChatMessage({
        id,
        newMessage: `uploads/img_${id}.png`,
        dateTime,
        sentBy,
        sentTo,
        type,
      });

      const savedImage = await newImage.save();
      callback({ success: true, message: savedImage });
      if (connectedUsers[sentTo]) {
        const socketId = connectedUsers[sentTo];
        io.to(socketId).emit("privateImage", savedImage);
      } else {
        console.log("User is offline");
      }
    } catch (err) {
      callback({ success: false, message: null });
      console.log("Error while storing image in local system.", err);
    }
  });

  socket.on("privateAudio", async (msg, callback) => {
    try {
      const { id, newMessage, dateTime, sentBy, sentTo, type } = msg;
      const { uploaded_audio } = newMessage;

      // convert base64 audio data to buffer
      const audioBuffer = Buffer.from(uploaded_audio, "base64");

      // Save the buffer to a file
      fs.writeFileSync(`uploads_audio/audio_${id}.wav`, audioBuffer);

      const newAudioMessage = new ChatMessage({
        id,
        newMessage: `uploads_audio/audio_${id}.wav`,
        dateTime,
        sentBy,
        sentTo,
        type,
      });

      const savedAudioMessage = await newAudioMessage.save();
      console.log(savedAudioMessage);
      if (connectedUsers[sentTo]) {
        const socketId = connectedUsers[sentTo];
        io.to(socketId).emit("privateAudio", savedAudioMessage);
      } else {
        console.log("User is offline");
      }

      callback({ success: true, message: savedAudioMessage });
    } catch (err) {
      callback({ success: false, message: null });
      console.log("Error while storing audio in the local system.", err);
    }
  });

  socket.on("privateMessage", async (msg, callback) => {
    const { id, sentTo, sentBy, newMessage, dateTime, type } = msg;
    // Insert chatting in chatting list api.
    try {
      const newChatMessage = new ChatMessage({
        id,
        newMessage,
        dateTime,
        sentBy,
        sentTo,
        type,
      });

      const savedMessage = await newChatMessage.save();
      console.log(savedMessage);
      // Send acknowledgment to the sender
    } catch (err) {
      console.error("Error while sending private chat into db", err);
      callback({ success: true, message: "Message not sent." });
    }

    if (connectedUsers[sentTo]) {
      const socketId = connectedUsers[sentTo];
      io.to(socketId).emit("privateMessage", msg);
      callback({ success: true, message: "Message sent successfully" });
    } else {
      console.log("User is offline");
      callback({ success: true, message: "Message in not fully delievered" });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    // Find and remove the disconnected user
    const disconnectedUser = Object.entries(connectedUsers).find(
      ([key, value]) => value === socket.id
    );

    if (disconnectedUser) {
      const [disconnectedEmail] = disconnectedUser;
      delete connectedUsers[disconnectedEmail];
      console.log(`User ${disconnectedEmail} removed from connected users.`);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
