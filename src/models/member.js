const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { toJSON } = require('./plugins');

const memberSchema = mongoose.Schema(
  {
    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    nationalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },
    
    // Contact Information
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: {
        type: String,
        default: 'Kenya',
      },
    },
    
    // Account Information
    memberId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'dormant'],
      default: 'active',
    },
    
    // Financial Information
    savingsBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    loanBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    shareCapital: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // Authentication
    pin: {
      type: String,
      private: true, // Used by the toJSON plugin
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    
    // WhatsApp Integration
    whatsappId: {
      type: String,
      unique: true,
      sparse: true,
    },
    
    // M-Pesa Integration
    mpesaNumber: {
      type: String,
      trim: true,
    },
    
    // Audit Fields
    createdBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add plugin that converts mongoose to JSON
memberSchema.plugin(toJSON);

/**
 * Check if member exists by phone number
 * @param {string} phoneNumber - The member's phone number
 * @param {ObjectId} [excludeMemberId] - The id of the member to be excluded
 * @returns {Promise<boolean>}
 */
memberSchema.statics.isPhoneNumberTaken = async function (phoneNumber, excludeMemberId) {
  const member = await this.findOne({ phoneNumber, _id: { $ne: excludeMemberId } });
  return !!member;
};

/**
 * Check if member exists by national ID
 * @param {string} nationalId - The member's national ID
 * @param {ObjectId} [excludeMemberId] - The id of the member to be excluded
 * @returns {Promise<boolean>}
 */
memberSchema.statics.isNationalIdTaken = async function (nationalId, excludeMemberId) {
  const member = await this.findOne({ nationalId, _id: { $ne: excludeMemberId } });
  return !!member;
};

/**
 * Check if member exists by member ID
 * @param {string} memberId - The member's ID
 * @param {ObjectId} [excludeMemberId] - The id of the member to be excluded
 * @returns {Promise<boolean>}
 */
memberSchema.statics.isMemberIdTaken = async function (memberId, excludeMemberId) {
  const member = await this.findOne({ memberId, _id: { $ne: excludeMemberId } });
  return !!member;
};

/**
 * Check if password matches the member's password
 * @param {string} pin - The PIN to check
 * @returns {Promise<boolean>}
 */
memberSchema.methods.isPinMatch = async function (pin) {
  const member = this;
  return bcrypt.compare(pin, member.pin);
};

memberSchema.pre('save', async function (next) {
  const member = this;
  if (member.isModified('pin')) {
    member.pin = await bcrypt.hash(member.pin, 8);
  }
  next();
});

// Virtual for member's full name
memberSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Indexes
memberSchema.index({ phoneNumber: 1 });
memberSchema.index({ nationalId: 1 });
memberSchema.index({ memberId: 1 });
memberSchema.index({ whatsappId: 1 });

const Member = mongoose.model('Member', memberSchema);

module.exports = Member;
