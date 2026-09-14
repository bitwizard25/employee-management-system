import mongoose from 'mongoose';
import { User, UserSchema } from '../src/users/schemas/user.schema';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!mongoUri) throw new Error('MONGO_URI is required');
  if (adminEmails.length === 0) {
    console.log('No ADMIN_EMAILS configured, nothing to do.');
    return;
  }

  await mongoose.connect(mongoUri);
  const UserModel = mongoose.model(User.name, UserSchema);

  const result = await UserModel.updateMany(
    { email: { $in: adminEmails } },
    { $set: { role: 'admin' } },
  );
  console.log(`Promoted ${result.modifiedCount} user(s) to admin.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
