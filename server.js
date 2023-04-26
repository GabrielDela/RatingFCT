const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyparser = require('body-parser');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
app.use(bodyparser.json());

const rateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1, // limit each IP to 10 requests per minute
});

const dbPath = './db.sqlite';
// Create the database file if it doesn't exist
if (!fs.existsSync(dbPath)) {
    fs.closeSync(fs.openSync(dbPath, 'w'));
}

const db = new sqlite3.Database(dbPath);

// Création de la table pour stocker les ratings
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS ratings (username TEXT PRIMARY KEY, positive INTEGER, negative INTEGER)');
});

// Route pour récupérer les ratings
app.get('/ratings', async (req, res) => {
    const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM ratings', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });

    const ratings = {};
    for (const row of rows) {
        ratings[row.username] = { positive: row.positive, negative: row.negative };
    }
    res.send(ratings);
});

// Route pour ajouter ou mettre à jour un vote
app.post('/ratings', rateLimiter, async (req, res) => {
    const { username, vote } = req.body;

    try {
        await addOrUpdateRating(username, vote);
        // Répond avec les ratings mis à jour
        const ratings = {};
        ratings[username] = await getRating(username);
        res.send(ratings);
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Server error' });
    }
});

// Fonction pour ajouter ou mettre à jour un vote dans la base de données
async function addOrUpdateRating(username, vote) {
    // Vérifie que le username et le vote sont valides
    if (!username || !['positive', 'negative'].includes(vote)) {
        throw new Error('Invalid inputs');
    }

    const { positive, negative } = await getRating(username);

    if (!positive && !negative) {
        // Ajout d'un nouvel utilisateur
        db.run('INSERT INTO ratings (username, positive, negative) VALUES (?, ?, ?)', username, vote === 'positive' ? 1 : 0, vote === 'negative' ? 1 : 0);
    } else {
        // Mise à jour des ratings existants
        db.run('UPDATE ratings SET positive = ?, negative = ? WHERE username = ?', positive + (vote === 'positive' ? 1 : 0), negative + (vote === 'negative' ? 1 : 0), username);
    }
}

// Fonction pour récupérer les ratings d'un utilisateur dans la base de données
async function getRating(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM ratings WHERE username = ?', username, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row || {});
            }
        });
    });
}

// Démarrage du serveur
app.listen(3000, () => {
    console.log('Server started on port 3000');
});