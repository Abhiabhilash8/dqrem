const exp = require("express");
const cron = require("node-cron");
const { Resend } = require("resend");
const { LeetCode } = require("leetcode-query");
const connectDB = require("./db/db");
const User = require("./models/user");
const userRoutes = require("./routes/userRoutes");
const path = require("path");
require("dotenv").config();

const app = exp();

connectDB();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

app.get("/", (req, res) => {
  console.log("hit at root");
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.use(exp.json());

// mount routes
app.use("/api", userRoutes);

const leetcode = new LeetCode();

// 📧 1. The Transporter is GONE. Using Resend API instead.
async function sendMail(to, title) {
  console.log("here in sendMail function for testing mail:", to);
  
  try {
    const { data, error } = await resend.emails.send({
      from: "LeetCode Reminder <onboarding@resend.dev>", // Default Resend testing address
      to: to,
      subject: "LeetCode Reminder 🚨",
      text: `Time to solve today's question !!!!! ${title}`,
    });

    if (error) {
      console.error(`Resend failed for ${to}:`, error);
    } else {
      console.log(`Email successfully sent to ${to}`);
    }
  } catch (err) {
    console.error(`Unexpected error sending to ${to}:`, err);
  }
}

function checkIfSolved(title, sublist) {
  // sub list is array of objects where each object.title says submission question title
  let flag = false;
  for (let sub of sublist) {
    if (sub.title === title && sub.statusDisplay == "Accepted") {
      flag = true;
      break;
    }
  }
  return flag;
}

async function checkAndNotify(username, email) {
  try {
    const daily = await leetcode.daily();
    let recent;

    try {
      recent = await leetcode.user(username);
    } catch (err) {
      console.log(`Invalid LeetCode user: ${username}`);
      return; // stop execution for this user
    }

    // 🔹 Check if user data exists
    if (!recent || !recent.recentSubmissionList) {
      console.log(`No data found for user: ${username}`);
      return;
    }

    const sl = recent.recentSubmissionList || [];
    const solved = checkIfSolved(daily.question.title, sl);

    if (!solved) {
      try {
        await sendMail(email, daily.question.title);
      } catch (err) {
        console.log(`Mail failed for ${email}`);
        console.log(err);
      }
    }
  } catch (err) {
    console.log("Error in checkAndNotify:", err);
    console.log(err);
  }
}

app.get("/run-reminder", async (req, res) => {
  // security check if the request is actually made from cronjob.org
  if (req.query.key !== process.env.REMINDER_KEY) {
    return res.status(403).send("Forbidden");
  }

  console.log("Reminder route triggered");

  try {
    const users = await User.find();
    console.log("Total users:", users.length);

    //  2. Defined the missing delay function here
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let user of users) {
      console.log("Checking user:", user.username);
      await checkAndNotify(user.username, user.email);
      
      await delay(2000);
    }

    res.send("Reminder execution completed");
  } catch (err) {
    console.log("Reminder route error:", err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = app;