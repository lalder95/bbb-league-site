import clientPromise from './mongodb';
import { DEFAULT_BADGE_PRESTIGE_CONFIG, normalizeBadgePrestigeConfig } from './badge-prestige-config';

const SETTINGS_KEY = 'badgePrestige';

async function getCollection() {
  const client = await clientPromise;
  return client.db('bbb-league').collection('appSettings');
}

export async function getBadgePrestigeSettings() {
  try {
    const collection = await getCollection();
    const doc = await collection.findOne({ key: SETTINGS_KEY });
    return {
      success: true,
      settings: normalizeBadgePrestigeConfig(doc?.settings || DEFAULT_BADGE_PRESTIGE_CONFIG),
      updatedAt: doc?.updatedAt || null,
      updatedBy: doc?.updatedBy || null,
    };
  } catch (error) {
    return { success: false, error: error.message, settings: DEFAULT_BADGE_PRESTIGE_CONFIG };
  }
}

export async function updateBadgePrestigeSettings(settings, updatedBy) {
  try {
    const normalized = normalizeBadgePrestigeConfig(settings);
    const collection = await getCollection();
    const updateDoc = {
      settings: normalized,
      updatedAt: new Date(),
      updatedBy: updatedBy || null,
    };

    await collection.updateOne(
      { key: SETTINGS_KEY },
      {
        $set: updateDoc,
        $setOnInsert: { key: SETTINGS_KEY, createdAt: new Date() },
      },
      { upsert: true }
    );

    return { success: true, settings: normalized, ...updateDoc };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
