/**
 * Migration: Ajouter destinationTag aux créateurs existants
 * 
 * Usage: node migrations/addDestinationTag.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Creator from '../models/Creator.js';

async function migrateDestinationTags() {
  try {
    console.log('🔄 Migration: Ajout des destinationTag aux créateurs existants\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Récupérer tous les créateurs
    const creators = await Creator.find({});
    console.log(`📊 Trouvé ${creators.length} créateurs\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const creator of creators) {
      try {
        // Vérifier si destinationTag existe déjà
        if (creator.destinationTag) {
          console.log(`⏭️  ${creator.username}: destinationTag déjà défini (${creator.destinationTag})`);
          skipped++;
          continue;
        }

        // Générer destinationTag depuis l'ObjectId
        const idHex = creator._id.toString().slice(-8);
        const destinationTag = parseInt(idHex, 16) % 4294967295;

        // Vérifier l'unicité
        const existing = await Creator.findOne({ destinationTag });
        if (existing && existing._id.toString() !== creator._id.toString()) {
          console.error(`❌ ${creator.username}: Collision de destinationTag (${destinationTag}) avec ${existing.username}`);
          errors++;
          continue;
        }

        // Mettre à jour
        creator.destinationTag = destinationTag;
        await creator.save();

        console.log(`✅ ${creator.username}: destinationTag = ${destinationTag}`);
        updated++;

      } catch (error) {
        console.error(`❌ ${creator.username}: Erreur -`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Résultats de la migration:');
    console.log('='.repeat(60));
    console.log(`✅ Mis à jour: ${updated}`);
    console.log(`⏭️  Ignorés: ${skipped}`);
    console.log(`❌ Erreurs: ${errors}`);
    console.log('='.repeat(60) + '\n');

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erreur de migration:', error);
    process.exit(1);
  }
}

// Exécuter la migration
migrateDestinationTags();