import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Creator from '../models/Creator.js';
import User from '../models/User.js';

dotenv.config();

const calculateDestinationTag = (userId) => {
  const idHex = userId.toString().slice(-8);
  return parseInt(idHex, 16) % 4294967295;
};

const addUserRefToCreators = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    // Récupérer tous les créateurs
    const creators = await Creator.find();
    console.log(`📊 Found ${creators.length} creators`);

    // Récupérer tous les users
    const users = await User.find();
    console.log(`📊 Found ${users.length} users`);

    let updated = 0;
    let alreadyLinked = 0;
    let notFound = 0;

    for (const creator of creators) {
      // Si le créateur a déjà une référence user, skip
      if (creator.user) {
        alreadyLinked++;
        console.log(`✅ Creator ${creator.username} already has user reference`);
        continue;
      }

      let matchedUser = null;

      // Stratégie 1 : Matcher par destinationTag pour wallets personnels
      if (creator.walletType === 'personal' && creator.destinationTag !== null && creator.destinationTag !== undefined) {
        matchedUser = users.find(u => {
          const calculatedTag = calculateDestinationTag(u._id);
          return calculatedTag === creator.destinationTag;
        });

        if (matchedUser) {
          console.log(`✅ [Personal Wallet] Matched ${creator.username} to ${matchedUser.email} via destinationTag ${creator.destinationTag}`);
        }
      }

      // Stratégie 2 : Pour wallets exchange, chercher par la relation User.creator
      if (!matchedUser) {
        matchedUser = users.find(u => 
          u.creator && u.creator.toString() === creator._id.toString()
        );

        if (matchedUser) {
          console.log(`✅ [User.creator] Matched ${creator.username} to ${matchedUser.email}`);
        }
      }

      // Stratégie 3 : Chercher par similarité email/username (fallback)
      if (!matchedUser && creator.username) {
        matchedUser = users.find(u => 
          u.email && u.email.split('@')[0].toLowerCase() === creator.username.toLowerCase()
        );

        if (matchedUser) {
          console.log(`⚠️  [Email Match] Matched ${creator.username} to ${matchedUser.email} (verify manually)`);
        }
      }

      // Si on a trouvé un match, mettre à jour
      if (matchedUser) {
        creator.user = matchedUser._id;
        await creator.save();
        updated++;
        console.log(`💾 Updated creator ${creator.username} with user ${matchedUser.email}`);
      } else {
        notFound++;
        console.error(`❌ Could not find matching user for creator: ${creator.username} (wallet: ${creator.walletType}, tag: ${creator.destinationTag || creator.userDestinationTag || 'none'})`);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Already linked: ${alreadyLinked}`);
    console.log(`   💾 Updated: ${updated}`);
    console.log(`   ❌ Not found: ${notFound}`);
    console.log(`   📈 Total: ${creators.length}`);

    if (notFound > 0) {
      console.log('\n⚠️  Some creators could not be matched. You may need to link them manually.');
    }

    console.log('\n🎉 Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

addUserRefToCreators();