import 'dotenv/config';
import mongoose from 'mongoose';

const draftSchema = new mongoose.Schema({
  draftId: Number,
  startDate: String,
  state: String,
  users: [{ username: String, nomOrder: Number }],
  players: [{ playerId: Number, playerName: String, position: String }],
  results: [{
    username: String,
    playerId: Number,
    highBid: Number,
    state: String,
    expiration: String
  }]
});

const Draft = mongoose.model('Draft', draftSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  await Draft.create({
    draftId: 215369854758,
    startDate: "2026-07-01T08:00:00Z",
    state: "FINAL",
    users: [
      { username: "jwalwer81", nomOrder: 1 },
      { username: "lalder", nomOrder: 2 },
      { username: "Schoontang", nomOrder: 3 }
    ],
    players: [
      { playerId: 2468, playerName: "Josh Allen", position: "QB" },
      { playerId: 2278, playerName: "Patrick Mahomes", position: "QB" },
      { playerId: 2455, playerName: "Malik Nabers", position: "RB" }
    ],
    results: [
      {
        username: "jwalwer81",
        playerId: 2468,
        highBid: 14,
        state: "ACTIVE",
        expiration: "2026-07-02T08:00:00Z"
      },
      {
        username: "jwalwer81",
        playerId: 2278,
        highBid: 14,
        state: "FINAL",
        expiration: "2026-07-02T08:00:00Z"
      },
      {
        username: "jwalwer81",
        playerId: 2455,
        highBid: 14,
        state: "FINAL",
        expiration: "2026-07-02T08:00:00Z"
      }
    ]
  });

  console.log('Draft inserted!');
  await mongoose.disconnect();
}

run().catch(console.error);