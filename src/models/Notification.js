const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Notification Model
 * Persistent notifications for one-time events (aircraft sold, leased out, etc.)
 */
const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  worldMembershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'world_membership_id',
    references: {
      model: 'world_memberships',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'aircraft_sold, aircraft_leased_out, lease_expired, lease_income, etc.'
  },
  icon: {
    type: DataTypes.STRING,
    defaultValue: 'plane'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  link: {
    type: DataTypes.STRING,
    allowNull: true
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_read'
  },
  gameTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'game_time',
    comment: 'Game time when event occurred'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['world_membership_id'] },
    { fields: ['is_read'] }
  ]
});

module.exports = Notification;
