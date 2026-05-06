// src/lib/db-helpers.js
import clientPromise from './mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

// Get the MongoDB database
async function getDatabase() {
  const client = await clientPromise;
  return client.db('bbb-league');
}

// Get the users collection
async function getUsersCollection() {
  const db = await getDatabase();
  return db.collection('users');
}

// Get all users
export async function getAllUsers() {
  console.log('Getting all users from MongoDB');
  const users = await getUsersCollection();
  const allUsers = await users.find({}).toArray();
  console.log(`Found ${allUsers.length} users in database`);
  return allUsers;
}

// Get user by ID
export async function getUserById(id) {
  console.log(`Looking up user by ID: ${id}`);
  const users = await getUsersCollection();
  const user = await users.findOne({ id });
  console.log(`User lookup by ID result: ${user ? 'Found user ' + user.username : 'User not found'}`);
  return user;
}

// Get user by username with case-insensitive search
export async function getUserByUsername(username) {
  if (!username) return null;
  
  console.log(`Looking up user by username: ${username}`);
  const users = await getUsersCollection();
  
  // Try case-insensitive search
  const user = await users.findOne({ 
    username: { $regex: new RegExp('^' + username + '$', 'i') } 
  });
  
  console.log(`User lookup result for '${username}': ${user ? 'Found user with ID ' + user.id : 'User not found'}`);
  return user;
}

// Update user password
export async function updateUserPassword(userId, hashedPassword, requireChange = true) {
  try {
    console.log(`Updating password for user ID: ${userId}`);
    const users = await getUsersCollection();
    
    const result = await users.updateOne(
      { id: userId },
      { 
        $set: { 
          password: hashedPassword,
          passwordChangeRequired: requireChange,
          passwordLastChanged: new Date().toISOString() 
        } 
      }
    );
    
    console.log(`Password update result: matchedCount=${result.matchedCount}, modifiedCount=${result.modifiedCount}`);
    
    if (result.matchedCount === 0) {
      console.log(`No user found with ID: ${userId}`);
      return { success: false, error: "User not found" };
    }
    
    return { success: true, persisted: true };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: error.message };
  }
}

// Add a new user
export async function addUser(newUser) {
  try {
    console.log(`Adding new user: ${newUser.username}`);
    const users = await getUsersCollection();
    
    // Check if username already exists
    const existing = await users.findOne({ 
      username: { $regex: new RegExp('^' + newUser.username + '$', 'i') } 
    });
    
    if (existing) {
      console.log(`Username already exists: ${newUser.username}`);
      return { success: false, error: "Username already exists" };
    }
    
    // Insert the new user
    const result = await users.insertOne(newUser);
    console.log(`New user added with ID: ${newUser.id}, MongoDB _id: ${result.insertedId}`);
    
    return { success: true, persisted: true, user: newUser };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, error: error.message };
  }
}

// Example: Add a new draft (add this if not present)
export async function addDraft(draft) {
  try {
    const db = await getDatabase();
    const drafts = db.collection('drafts');
    // Ensure blind is set (default to false)
    const draftWithBlind = { ...draft, blind: typeof draft.blind === 'boolean' ? draft.blind : false };
    const result = await drafts.insertOne(draftWithBlind);
    return { success: true, draft: draftWithBlind, insertedId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Example: Update draft (add this if not present)
export async function updateDraft(id, update) {
  try {
    const db = await getDatabase();
    const drafts = db.collection('drafts');
    // If blind is not set, don't overwrite it
    if (!Object.prototype.hasOwnProperty.call(update, 'blind')) {
      delete update.blind;
    }
    const result = await drafts.updateOne({ _id: id }, { $set: update });
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Add contract change
export async function addContractChange(change) {
  try {
    const db = await getDatabase();
    const changes = db.collection('contractChanges');
    const result = await changes.insertOne(change);
    return { success: true, change, insertedId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get contract changes
export async function getContractChanges() {
  try {
    const db = await getDatabase();
    const changes = db.collection('contractChanges');
    const allChanges = await changes.find({}).toArray();
    return allChanges;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getMediaFeedCollection() {
  const db = await getDatabase();
  const collection = db.collection('mediaFeedItems');
  await collection.createIndex({ sourceKey: 1 }, { unique: true });
  await collection.createIndex({ source: 1, timestamp: -1 });
  return collection;
}

async function getBankerFeedThreadsCollection() {
  const db = await getDatabase();
  const collection = db.collection('bankerFeedThreads');
  await collection.createIndex({ tweetKey: 1 }, { unique: true });
  await collection.createIndex({ parentSourceKey: 1, updatedAt: -1 });
  await collection.createIndex({ 'messages.userId': 1, 'messages.createdAt': -1 });
  await collection.createIndex({ updatedAt: -1 });
  return collection;
}

export async function getMediaFeedItems({ source, limit } = {}) {
  try {
    const collection = await getMediaFeedCollection();
    const query = {};
    if (source) {
      query.source = source;
    }

    let cursor = collection.find(query).sort({ timestamp: -1 });
    if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
      cursor = cursor.limit(Number(limit));
    }

    return await cursor.toArray();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function upsertMediaFeedItem(item) {
  try {
    if (!item?.sourceKey) {
      return { success: false, error: 'sourceKey is required' };
    }

    const collection = await getMediaFeedCollection();
    const result = await collection.updateOne(
      { sourceKey: item.sourceKey },
      {
        $setOnInsert: {
          ...item,
          createdAt: item.createdAt || new Date(),
        },
      },
      { upsert: true }
    );

    return {
      success: true,
      inserted: result.upsertedCount > 0,
      sourceKey: item.sourceKey,
    };
  } catch (error) {
    if (error?.code === 11000) {
      return { success: true, inserted: false, sourceKey: item?.sourceKey };
    }
    return { success: false, error: error.message };
  }
}

export async function getMediaFeedSyncState(syncKey) {
  try {
    const col = await getAppSettingsCollection();
    const doc = await col.findOne({ key: `mediaFeedSync:${syncKey}` });
    return { success: true, state: doc || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateMediaFeedSyncState(syncKey, state) {
  try {
    const col = await getAppSettingsCollection();
    const updateDoc = {
      ...state,
      updatedAt: new Date(),
    };

    await col.updateOne(
      { key: `mediaFeedSync:${syncKey}` },
      {
        $set: updateDoc,
        $setOnInsert: { key: `mediaFeedSync:${syncKey}`, createdAt: new Date() },
      },
      { upsert: true }
    );

    return { success: true, state: updateDoc };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getAppSettingsCollection() {
  const db = await getDatabase();
  return db.collection('appSettings');
}

export async function getContractManagementSettings() {
  try {
    const col = await getAppSettingsCollection();
    const doc = await col.findOne({ key: 'contractManagement' });
    return {
      success: true,
      settings: {
        contractYearOverride: Number.isFinite(parseInt(doc?.contractYearOverride, 10))
          ? parseInt(doc.contractYearOverride, 10)
          : null,
        updatedAt: doc?.updatedAt || null,
        updatedBy: doc?.updatedBy || null,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateContractManagementSettings({ contractYearOverride, updatedBy }) {
  try {
    let normalizedOverride = null;
    if (contractYearOverride !== null && contractYearOverride !== undefined && contractYearOverride !== '') {
      normalizedOverride = parseInt(contractYearOverride, 10);
      if (!Number.isFinite(normalizedOverride)) {
        return { success: false, error: 'contractYearOverride must be a valid year or null' };
      }
    }

    const col = await getAppSettingsCollection();
    const updateDoc = {
      contractYearOverride: normalizedOverride,
      updatedAt: new Date(),
      updatedBy: updatedBy || null,
    };

    await col.updateOne(
      { key: 'contractManagement' },
      {
        $set: updateDoc,
        $setOnInsert: { key: 'contractManagement', createdAt: new Date() },
      },
      { upsert: true }
    );

    return {
      success: true,
      settings: updateDoc,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Announcements helpers
async function getAnnouncementsCollection() {
  const db = await getDatabase();
  return db.collection('announcements');
}

export async function addAnnouncement({ message, link, startAt, endAt, createdBy }) {
  try {
    if (!message || !startAt || !endAt) {
      return { success: false, error: 'message, startAt, and endAt are required' };
    }
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: false, error: 'Invalid startAt or endAt datetime' };
    }
    const col = await getAnnouncementsCollection();
    const doc = {
      message: String(message),
      link: link ? String(link) : '',
      startAt: startDate,
      endAt: endDate,
      createdAt: new Date(),
      createdBy: createdBy || null,
    };
    const result = await col.insertOne(doc);
    return { success: true, insertedId: result.insertedId, announcement: { ...doc, _id: result.insertedId } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getActiveAnnouncements(now = new Date()) {
  try {
    const col = await getAnnouncementsCollection();
    const list = await col
      .find({ startAt: { $lte: now }, endAt: { $gte: now } })
      .sort({ startAt: -1 })
      .toArray();
    return list;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAllAnnouncements() {
  try {
    const col = await getAnnouncementsCollection();
    const list = await col.find({}).sort({ startAt: -1 }).toArray();
    return list;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateAnnouncement(id, { message, link, startAt, endAt }) {
  try {
    if (!id) return { success: false, error: 'id is required' };
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const col = await getAnnouncementsCollection();
    const update = {};
    if (message !== undefined) update.message = String(message);
    if (link !== undefined) update.link = link ? String(link) : '';
    if (startAt !== undefined) {
      const d = new Date(startAt);
      if (isNaN(d.getTime())) return { success: false, error: 'Invalid startAt' };
      update.startAt = d;
    }
    if (endAt !== undefined) {
      const d = new Date(endAt);
      if (isNaN(d.getTime())) return { success: false, error: 'Invalid endAt' };
      update.endAt = d;
    }
    if (Object.keys(update).length === 0) {
      return { success: false, error: 'No fields to update' };
    }
    const result = await col.updateOne({ _id }, { $set: update });
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteAnnouncement(id) {
  try {
    if (!id) return { success: false, error: 'id is required' };
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const col = await getAnnouncementsCollection();
    const result = await col.deleteOne({ _id });
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Rule Changes helpers
async function getRuleChangesCollection() {
  const db = await getDatabase();
  return db.collection('ruleChanges');
}

export async function addRuleChange({ description, effectiveYear, createdBy }) {
  try {
    if (!description || !effectiveYear) {
      return { success: false, error: 'description and effectiveYear are required' };
    }
    const year = parseInt(effectiveYear, 10);
    if (!Number.isFinite(year)) {
      return { success: false, error: 'effectiveYear must be a valid year' };
    }
    const col = await getRuleChangesCollection();
    const doc = {
      description: String(description),
      effectiveYear: year,
      createdAt: new Date(),
      createdBy: createdBy || null,
    };
    const result = await col.insertOne(doc);
    return { success: true, insertedId: result.insertedId, ruleChange: { ...doc, _id: result.insertedId } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAllRuleChanges() {
  try {
    const col = await getRuleChangesCollection();
    const list = await col.find({}).sort({ effectiveYear: 1, createdAt: -1 }).toArray();
    return list;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateRuleChange(id, { description, effectiveYear }) {
  try {
    if (!id) return { success: false, error: 'id is required' };
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const col = await getRuleChangesCollection();
    const update = {};
    if (description !== undefined) update.description = String(description);
    if (effectiveYear !== undefined) {
      const year = parseInt(effectiveYear, 10);
      if (!Number.isFinite(year)) return { success: false, error: 'Invalid effectiveYear' };
      update.effectiveYear = year;
    }
    if (Object.keys(update).length === 0) {
      return { success: false, error: 'No fields to update' };
    }
    const result = await col.updateOne({ _id }, { $set: update });
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteRuleChange(id) {
  try {
    if (!id) return { success: false, error: 'id is required' };
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const col = await getRuleChangesCollection();
    const result = await col.deleteOne({ _id });
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getBankerFeedThread(tweetKey) {
  try {
    if (!tweetKey) {
      return { success: false, error: 'tweetKey is required' };
    }

    const collection = await getBankerFeedThreadsCollection();
    const thread = await collection.findOne({ tweetKey });
    return { success: true, thread: thread || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function appendBankerFeedThreadMessages({
  tweetKey,
  parentSourceKey,
  parentSnapshot,
  aiParticipants,
  messages,
}) {
  try {
    if (!tweetKey) {
      return { success: false, error: 'tweetKey is required' };
    }

    const normalizedMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
    if (normalizedMessages.length === 0) {
      return { success: false, error: 'messages are required' };
    }

    const collection = await getBankerFeedThreadsCollection();
    await collection.updateOne(
      { tweetKey },
      {
        $set: {
          updatedAt: new Date(),
          parentSourceKey: parentSourceKey || null,
          parentSnapshot: parentSnapshot || null,
          aiParticipants: Array.isArray(aiParticipants) ? aiParticipants : [],
        },
        $setOnInsert: {
          createdAt: new Date(),
          tweetKey,
        },
        $push: {
          messages: {
            $each: normalizedMessages,
          },
        },
      },
      { upsert: true }
    );

    return { success: true, tweetKey };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getBankerFeedUserMessageTimestamps({ userId, since }) {
  try {
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }

    const collection = await getBankerFeedThreadsCollection();
    const pipeline = [
      { $unwind: '$messages' },
      {
        $match: {
          'messages.authorType': 'user',
          'messages.userId': userId,
          ...(since ? { 'messages.createdAt': { $gte: since } } : {}),
        },
      },
      { $sort: { 'messages.createdAt': 1 } },
      { $project: { _id: 0, createdAt: '$messages.createdAt' } },
    ];

    const rows = await collection.aggregate(pipeline).toArray();
    return {
      success: true,
      timestamps: rows.map((row) => row.createdAt).filter(Boolean),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getBankerFeedThreadCounts(tweetKeys = []) {
  try {
    const normalizedKeys = Array.from(new Set((Array.isArray(tweetKeys) ? tweetKeys : []).filter(Boolean)));
    if (normalizedKeys.length === 0) {
      return { success: true, counts: {} };
    }

    const collection = await getBankerFeedThreadsCollection();
    const rows = await collection.aggregate([
      { $match: { tweetKey: { $in: normalizedKeys } } },
      {
        $project: {
          _id: 0,
          tweetKey: 1,
          replyCount: { $size: { $ifNull: ['$messages', []] } },
        },
      },
    ]).toArray();

    const counts = normalizedKeys.reduce((accumulator, key) => {
      accumulator[key] = 0;
      return accumulator;
    }, {});

    rows.forEach((row) => {
      counts[row.tweetKey] = Number(row.replyCount || 0);
    });

    return { success: true, counts };
  } catch (error) {
    return { success: false, error: error.message };
  }
}