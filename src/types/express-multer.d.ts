// Forces TypeScript to process @types/multer global namespace augmentation
// (required since @types/multer v2 no longer auto-augments Express.Multer)
import 'multer';

export {};
