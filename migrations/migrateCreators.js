import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Creator from '../models/Creator.js';

dotenv.config();

const migrateCreators = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    // Récupérer tous les créateurs
    const creators = await Creator.find();

    console.log(`📊 Found ${creators.length} creators to migrate`);

    for (const creator of creators) {
      // Si walletType n'existe pas, c'est un ancien créateur
      if (!creator.walletType) {
        creator.walletType = 'personal';
        
        // S'assurer que le destinationTag existe
        if (!creator.destinationTag) {
          const idHex = creator._id.toString().slice(-8);
          creator.destinationTag = parseInt(idHex, 16) % 4294967295;
        }

        await creator.save();
        console.log(`✅ Migrated creator: ${creator.username} (tag: ${creator.destinationTag})`);
      }
    }

    console.log('🎉 Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migrateCreators();