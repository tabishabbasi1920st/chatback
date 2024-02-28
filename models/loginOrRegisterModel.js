const { Schema, model } = require("mongoose");

// Define the schema
const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

// Create the model
const LoginOrRegisterModel = model("users", userSchema);
// model(collectionName in which we inserting data, userSchema)

module.exports = LoginOrRegisterModel;
