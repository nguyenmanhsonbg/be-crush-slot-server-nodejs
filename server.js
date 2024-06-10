import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import sql from "mssql";

//#region define
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const SECRET_KEY = "123123";
// SQL Server configuration
const sqlConfig = {
  user: "crush-slot-db-admin",
  password: "sa",
  server: "A14S-DEV-02",
  port: 1433,
  database: "CrushSlotDB",
  options: {
    encrypt: false, // for local development
    trustServerCertificate: true, // change to false for production
  },
};

//#endregion

//#region Authentication
// Middleware for checking the token
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization").replace("Bearer ", "");
  if (!token) {
    return res.status(401).send("Access Denied");
  }

  try {
    const verified = jwt.verify(token, SECRET_KEY);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).send("Invalid Token");
  }
};

// User login function
app.post("/login", async (req, res) => {
  console.log(req.body);
  const { telegramId } = req.body;
  try {
    await sql.connect(sqlConfig);
    const result =
      await sql.query`SELECT * FROM Users WHERE telegram_id = ${telegramId}`;
    console.log("Record set length: " + result.recordset.length);
    console.log(result.recordset);
    if (result.recordset.length === 0) {
      return res.status(400).json({ message: "Username not found" });
    }
    const user = result.recordset[0];
    const token = jwt.sign({ id: user.user_id }, SECRET_KEY, {
      expiresIn: "1h",
    });
    res.status(200).json({ token, message: "Login successful" });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    } else {
      console.error(error);
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
//#endregion

//#region Save/Load Api
app.post("/saveUserData", authenticateToken, async (req, res) => {
  const { telegram_id, registration_date } = req.body;

  try {
    await sql.connect(sqlConfig);
    const request = new sql.Request();
    const query = `INSERT INTO USERS (telegram_id, registration_date) VALUES (@telegram_id, @registration_date)`;

    request.input("telegram_id", sql.VarChar(50), telegram_id);
    request.input("registration_date", sql.DateTime, registration_date);

    await request.query(query);
    res.status(200).send("User data saved successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.get("/loadUserData/:telegram_id", authenticateToken, async (req, res) => {
  const { telegram_id } = req.params;

  try {
    await sql.connect(sqlConfig);
    const request = new sql.Request();
    const query = `SELECT u.user_id, u.telegram_id, dfs.last_reset, dfs.spin
                    FROM USERS u 
                    LEFT JOIN DAILY_FREE_SPIN dfs 
                    ON u.user_id = dfs.user_id 
                    WHERE u.telegram_id = @telegram_id`;

    request.input("telegram_id", sql.VarChar(50), telegram_id);

    const result = await request.query(query);
    if (result.recordset.length === 0) {
      return res.status(404).send("User not found");
    }
    console.log(result);
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
//#endregion

//#region Spin  API
app.post("/spin", authenticateToken, async (req, res) => {
  const { telegramId } = req.body;

  try {
    await sql.connect(sqlConfig);

    // Retrieve the user data based on telegramId
    const userResult =
      await sql.query`SELECT u.user_id, dfs.spin FROM USERS u LEFT JOIN DAILY_FREE_SPIN dfs ON u.user_id = dfs.user_id WHERE u.telegram_id = ${telegramId}`;

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.recordset[0];
    if (user.spin <= 0) {
      return res.status(400).json({ message: "Not enough spins" });
    }

    // Randomize the result of the spin
    const spinResult = [
      Math.floor(Math.random() * 6),
      Math.floor(Math.random() * 6),
      Math.floor(Math.random() * 6),
    ];

    // Save the spin result in SPIN_HISTORY
    const request = new sql.Request();
    request.input("user_id", sql.Int, user.user_id);
    request.input("spin_time", sql.DateTime, new Date());
    request.input("result", sql.VarChar(100), spinResult.toString());

    const query = `
      INSERT INTO SPIN_HISTORY (user_id, spin_time, result)
      VALUES (@user_id, @spin_time, @result);
    `;

    await request.query(query);

    const spinRemain = user.spin - 1;
    request.input("spin", spinRemain);

    // Update the user's spin count
    const updateQuery = `
      UPDATE DAILY_FREE_SPIN SET spin = @spin WHERE user_id = @user_id
    `;
    await request.query(updateQuery);

    // Respond to the client with the spin result
    console.log(spinResult);
    res.status(200).json({ spinResult });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.post("/checkAndResetFreeSpin", authenticateToken, async (req, res) => {
  const { telegramId } = req.body;

  try {
    await sql.connect(sqlConfig);
    const request = new sql.Request();

    // Fetch user and config data
    const spinConfigQuery = `
      SELECT dfs.last_reset, dfs.spin, c.daily_reset_time, c.daily_free_spin
      FROM USERS u 
      LEFT JOIN DAILY_FREE_SPIN dfs ON u.user_id = dfs.user_id
      LEFT JOIN CONFIG c ON 1=1
      WHERE u.telegram_id = @telegramId
    `;
    request.input("telegramId", sql.VarChar(50), telegramId);
    const spinConfigResult = await request.query(spinConfigQuery);
    if (spinConfigResult.recordset.length === 0) {
      return res.status(404).send("User spin data or config not found");
    }

    const userSpinData = spinConfigResult.recordset[0];
    const currentTime = new Date();
    const lastResetTime = new Date(userSpinData.last_reset);
    const dailyResetTime = userSpinData.daily_reset_time;

    // Convert daily reset time to 24-hour format
    const resetTimeParts = dailyResetTime.match(/(\d+):(\d+)([APM]+)/);
    let resetHour = parseInt(resetTimeParts[1]);
    const resetMinute = parseInt(resetTimeParts[2]);
    const period = resetTimeParts[3];

    if (period === "PM" && resetHour !== 12) {
      resetHour += 12;
    } else if (period === "AM" && resetHour === 12) {
      resetHour = 0;
    }

    // Calculate the next reset time for today
    const nextResetTime = new Date(currentTime);
    nextResetTime.setHours(resetHour, resetMinute, 0, 0);

    // Check if the current time is past today's reset time and the last reset was before today’s reset time
    if (currentTime >= nextResetTime && lastResetTime < nextResetTime) {
      // Reset spins for the new day
      userSpinData.spin = userSpinData.daily_free_spin;
      userSpinData.last_reset = currentTime;

      // Update DAILY_FREE_SPIN
      const updateSpinQuery = `
        UPDATE DAILY_FREE_SPIN 
        SET spin = @spin, last_reset = @last_reset 
        WHERE user_id = (SELECT user_id FROM USERS WHERE telegram_id = @telegramId)
      `;
      request.input("spin", sql.Int, userSpinData.spin);
      request.input("last_reset", sql.DateTime, userSpinData.last_reset);
      await request.query(updateSpinQuery);

      return res
        .status(200)
        .json({ message: "Daily free spins reset", spin: userSpinData.spin });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
//#endregion

export default app;
