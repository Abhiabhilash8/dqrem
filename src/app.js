const exp = require("express");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { LeetCode } = require("leetcode-query");
const connectDB = require("./db/db");
const User = require("./models/user");
const userRoutes = require("./routes/userRoutes");
const path = require("path");
require("dotenv").config();

const app = exp();

connectDB();

// 📧 SMTP Configuration with Connection Pooling
// Nodemailer transporter with connection pooling for scalability
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
  pool: {
    maxConnections: 5, // Max concurrent connections
    maxMessages: 100, // Max messages per connection
    rateDelta: 1000, // Time window (ms) for rate limit
    rateLimit: 5, // Messages per rateDelta
  },
  logger: false,
  debug: false,
});

// 📧 Simple Email Queue for scalability (handle 300+ emails daily)
// Using a semaphore pattern for concurrency control
let activeEmails = 0;
const MAX_CONCURRENT = 5;

const emailQueue = {
  active: 0,
  waiting: [],
  
  async add(fn) {
    while (this.active >= MAX_CONCURRENT) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const resolve = this.waiting.shift();
      if (resolve) resolve();
    }
  },
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries

app.get("/", (req, res) => {
  console.log("hit at root");
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.use(exp.json());

// mount routes
app.use("/api", userRoutes);

const leetcode = new LeetCode();

// 📧 Send email with retry logic
async function sendMailWithRetry(to, title, attempt = 1) {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: to,
      subject: "LeetCode Daily Reminder 🚨",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ffa500;">⏰ LeetCode Daily Reminder</h2>
          <p>Hey there! 👋</p>
          <p>Time to solve today's LeetCode question:</p>
          <h3 style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">${title}</h3>
          <p>Don't forget to keep up with your coding practice! 💪</p>
          <p style="color: #666; font-size: 12px;">Cheers,<br/>LeetCode Reminder Bot</p>
        </div>
      `,
      text: `Time to solve today's question !!!!! ${title}`,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email successfully sent to ${to} [Attempt ${attempt}]`);
    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error(
      `❌ Email failed for ${to} [Attempt ${attempt}/${MAX_RETRIES}]:`,
      err.message
    );

    // Retry logic
    if (attempt < MAX_RETRIES) {
      console.log(`🔄 Retrying in ${RETRY_DELAY}ms...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return sendMailWithRetry(to, title, attempt + 1);
    }

    return { success: false, error: err.message };
  }
}

// 📧 Queue email for sending (non-blocking)
async function sendMail(to, title) {
  return emailQueue.add(async () => {
    console.log(`📬 Queued email for ${to}`);
    return sendMailWithRetry(to, title);
  });
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
      console.log(`⚠️  Invalid LeetCode user: ${username}`);
      return; // stop execution for this user
    }

    // 🔹 Check if user data exists
    if (!recent || !recent.recentSubmissionList) {
      console.log(`⚠️  No data found for user: ${username}`);
      return;
    }

    const sl = recent.recentSubmissionList || [];
    const solved = checkIfSolved(daily.question.title, sl);

    if (!solved) {
      try {
        await sendMail(email, daily.question.title);
      } catch (err) {
        console.error(`❌ Mail queuing failed for ${email}:`, err.message);
      }
    } else {
      console.log(`✓ User ${username} already solved today's question`);
    }
  } catch (err) {
    console.error(`❌ Error in checkAndNotify for ${username}:`, err.message);
  }
}

app.get("/run-reminder", async (req, res) => {
  // security check if the request is actually made from cronjob.org
  if (req.query.key !== process.env.REMINDER_KEY) {
    return res.status(403).send("Forbidden");
  }

  console.log("\n🚀 Reminder route triggered at:", new Date().toISOString());

  try {
    const users = await User.find();
    console.log(`📊 Total users to process: ${users.length}`);

    const emailPromises = [];
    let successCount = 0;
    let failureCount = 0;

    for (let user of users) {
      console.log(`👤 Processing user: ${user.username}`);
      try {
        const emailPromise = checkAndNotify(user.username, user.email)
          .then(() => {
            successCount++;
          })
          .catch((err) => {
            console.error(`Failed for ${user.username}:`, err);
            failureCount++;
          });
        emailPromises.push(emailPromise);
      } catch (err) {
        console.error(`Error queueing user ${user.username}:`, err);
        failureCount++;
      }
    }

    // Wait for all emails to be queued and processed
    await Promise.all(emailPromises);

    const summary = `\n✅ Reminder execution completed!\n📈 Summary: ${successCount} sent, ${failureCount} failed\n`;
    console.log(summary);

    res.send(summary);
  } catch (err) {
    console.error("❌ Reminder route error:", err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = app;