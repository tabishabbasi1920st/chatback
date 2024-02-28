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

const app = express();
app.use(cors());
app.use(express.json());

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
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await hash(password, 10);

    const newUser = new LoginOrRegisterModel({
      name,
      email,
      password: hashedPassword,
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
app.get("/all-chats", async (req, res) => {
  try {
    const allChats = await UserModel.find();
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

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("setEmail", (email, callback) => {
    // add user to the list of connected users
    connectedUsers[email] = socket.id;
    callback({ connectedUsers });
    console.log(connectedUsers);
  });

  socket.on("privateMessage", async (msg, callback) => {
    const { sentTo, sentBy, newMessage, dateTime } = msg;
    // Insert chatting in chatting list api.
    try {
      const newChatMessage = new ChatMessage({
        newMessage,
        dateTime,
        sentBy,
        sentTo,
      });

      const savedMessage = await newChatMessage.save();
      // Send acknowledgment to the sender
      callback({ success: true, message: "Message sent successfully" });
    } catch (err) {
      console.error("Error while sending private chat into db", err);
      callback({ success: true, message: "Message not sent." });
    }

    if (connectedUsers[sentTo]) {
      const socketId = connectedUsers[sentTo];
      io.to(socketId).emit("privateMessage", msg);
    } else {
      console.log("User is offline");
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