const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemSettings = sequelize.define('SystemSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'system_settings',
  timestamps: true,
  underscored: true
});

// Helper methods
SystemSettings.get = async function(key, defaultValue = null) {
  const setting = await this.findOne({ where: { key } });
  if (!setting) return defaultValue;

  // Try to parse as JSON, otherwise return raw value
  try {
    return JSON.parse(setting.value);
  } catch {
    return setting.value;
  }
};

SystemSettings.set = async function(key, value, description = null) {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

  const [setting, created] = await this.findOrCreate({
    where: { key },
    defaults: { value: stringValue, description }
  });

  if (!created) {
    setting.value = stringValue;
    if (description) setting.description = description;
    await setting.save();
  }

  return setting;
};

module.exports = SystemSettings;
