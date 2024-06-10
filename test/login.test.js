import request from "supertest";
import { expect } from "chai";
import app from "../server.js"; // Adjust the path as necessary

describe("POST /login", () => {
  it("should return 400 if username is not found", (done) => {
    request(app)
      .post("/login")
      .send({ telegramId: "user1_telegram" })
      .expect(400)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.equal("Username not found");
        done();
      });
  });

  it("should return 400 if password is incorrect", (done) => {
    // Assuming a user 'testuser' with password 'password123' exists in the database
    request(app)
      .post("/login")
      .send({ telegramId: "testuser" })
      .expect(400)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.equal("Invalid password");
        done();
      });
  });

  it("should return 200 and a token for valid credentials", (done) => {
    // Assuming a user 'testuser' with password 'password123' exists in the database
    request(app)
      .post("/login")
      .send({ telegramId: "testuser" })
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.be.a("string");
        expect(res.text.length).to.be.greaterThan(0);
        done();
      });
  });
});
