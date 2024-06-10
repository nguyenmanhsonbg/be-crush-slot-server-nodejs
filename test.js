import axios from "axios";
import assert from "assert";

const baseURL = "http://localhost:3000";

// Test data
const testData = {
  telegram_id: "user1_telegram",
  registration_date: "2024-06-07T00:00:00Z",
};

// Placeholder for storing the token
let authToken = "";

// User login function for testing
async function testLogin() {
  try {
    const response = await axios.post(`${baseURL}/login`, {
      telegramId: testData.telegram_id,
    });
    assert.strictEqual(response.status, 200);
    authToken = response.data.token;
    console.log("Login Test Passed");
  } catch (error) {
    console.error("Login Test Failed", error);
  }
}

// Save user data test
async function testSaveUserData() {
  try {
    const response = await axios.post(`${baseURL}/saveUserData`, testData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data, "User data saved successfully");
    console.log("Save User Data Test Passed");
  } catch (error) {
    console.error("Save User Data Test Failed", error);
  }
}

// Load user data test when logged in
async function testLoadUserDataLoggedIn() {
  try {
    const response = await axios.get(
      `${baseURL}/loadUserData/${testData.telegram_id}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.telegram_id, testData.telegram_id);
    console.log("Load User Data When Logged In Test Passed");
    console.log(response.data);
  } catch (error) {
    console.error("Load User Data When Logged In Test Failed", error);
  }
}

// Spin test when logged in
async function testSpinLoggedIn() {
  try {
    const response = await axios.post(
      `${baseURL}/spin`,
      { telegramId: testData.telegram_id },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert.strictEqual(response.status, 200);
    assert(response.data.spinResult instanceof Array);
    assert(response.data.spinResult.length === 3);
    console.log("Spin Test Passed");
    console.log(response.data);
  } catch (error) {
    console.error("Spin Test Failed", error);
  }
}

// Load user data test when not logged in
async function testLoadUserDataNotLoggedIn() {
  try {
    const response = await axios.get(
      `${baseURL}/loadUserData/${testData.telegram_id}`
    );
    assert.strictEqual(response.status, 401); // Expecting Unauthorized error
    console.log("Load User Data When Not Logged In Test Passed");
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log("Load User Data When Not Logged In Test Passed");
    } else {
      console.error("Load User Data When Not Logged In Test Failed", error);
    }
  }
}

// Run tests
async function runTests() {
  await testLogin();
  await testSaveUserData();
  await testLoadUserDataLoggedIn();
  await testSpinLoggedIn();
  await testLoadUserDataNotLoggedIn();
}

runTests();
