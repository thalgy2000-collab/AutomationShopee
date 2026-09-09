// Wrapper para create_lote.mjs em ESM
import('./create_lote.mjs').catch(err => {
  console.error(err);
  process.exit(1);
});
