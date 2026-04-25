#!/bin/bash
# ============================================
# SYNC COMPLÈTE : Email → SQLite → Parsing IA
# ============================================
# Ce script :
# 1. Installe les dépendances
# 2. Lance la sync complète de TOUS les emails
# 3. Parse tous les emails avec l'IA
# 4. Affiche les stats
#
# Usage : bash run-full-sync.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "═══════════════════════════════════════"
echo "  🚀 SYNC COMPLÈTE ALPICOIS"
echo "═══════════════════════════════════════"
echo ""

# Vérifier .env
if [ ! -f .env ]; then
  echo "⚠️  Fichier .env non trouvé !"
  echo "   Copie depuis .env.example..."
  cp .env.example .env
  echo "   ➡️  Éditez .env avec vos credentials avant de continuer"
  exit 1
fi

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install --silent

# Étape 1 : Sync complète
echo ""
echo "═══════════════════════════════════════"
echo "  📥 ÉTAPE 1 : SYNC EMAIL"
echo "═══════════════════════════════════════"
node sync.js --full

# Étape 2 : Parsing IA
echo ""
echo "═══════════════════════════════════════"
echo "  🧠 ÉTAPE 2 : PARSING IA"
echo "═══════════════════════════════════════"
node parse-emails.js

# Stats finales
echo ""
echo "═══════════════════════════════════════"
echo "  ✅ SYNC COMPLÈTE TERMINÉE !"
echo "═══════════════════════════════════════"
echo ""
echo "  📁 Base de données : $(realpath "$DB_PATH" 2>/dev/null || echo "$SCRIPT_DIR/../emails.db")"
echo "  📧 Tous les emails historiques ont été synchronisés et analysés."
echo ""
echo "  🖥️  Pour voir les données : lancez le frontend"
echo "     cd .. && npm run dev"
echo ""
