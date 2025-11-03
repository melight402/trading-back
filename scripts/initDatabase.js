import { initDatabase, closeDatabase } from '../db/database.js';

initDatabase()
  .then(() => {
    console.log('Database initialized successfully');
    return closeDatabase();
  })
  .then(() => {
    console.log('Database connection closed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error initializing database:', error);
    process.exit(1);
  });

