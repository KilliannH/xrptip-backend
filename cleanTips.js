import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Tip from './models/Tip.js';
import Creator from './models/Creator.js';

dotenv.config();

const cleanTips = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    // Récupérer tous les créateurs
    const creators = await Creator.find();
    
    for (const creator of creators) {
      const expectedDestinationTag = creator.walletType === 'exchange' 
        ? creator.userDestinationTag 
        : creator.destinationTag;

      console.log(`\n📊 Checking creator: ${creator.username}`);
      console.log(`   Expected destination tag: ${expectedDestinationTag}`);

      // Compter les tips avec le mauvais destination tag
      const wrongTips = await Tip.countDocuments({
        creator: creator._id,
        destinationTag: { $ne: expectedDestinationTag }
      });

      if (wrongTips > 0) {
        console.log(`   ⚠️  Found ${wrongTips} tips with wrong destination tag`);
        
        // Option 1 : Supprimer les mauvais tips
        await Tip.deleteMany({
          creator: creator._id,
          destinationTag: { $ne: expectedDestinationTag }
        });
        console.log(`   ✅ Deleted ${wrongTips} incorrect tips`);

        // Recalculer les stats
        const correctTips = await Tip.find({
          creator: creator._id,
          destinationTag: expectedDestinationTag,
          status: 'confirmed'
        });

        const totalTips = correctTips.length;
        const totalAmount = correctTips.reduce((sum, tip) => sum + tip.amount, 0);
        const uniqueSupporters = [...new Set(correctTips.map(t => t.senderAddress))].length;

        creator.stats.totalTips = totalTips;
        creator.stats.totalAmount = totalAmount;
        creator.stats.uniqueSupporters = uniqueSupporters;
        
        await creator.save();
        console.log(`   ✅ Stats updated: ${totalTips} tips, ${totalAmount.toFixed(2)} XRP`);
      } else {
        console.log(`   ✅ All tips are correct`);
      }
    }

    console.log('\n🎉 Cleanup completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

cleanTips();