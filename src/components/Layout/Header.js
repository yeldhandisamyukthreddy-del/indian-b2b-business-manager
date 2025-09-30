import React from 'react';
import { Layout, Select, Switch, Space, Avatar, Dropdown, Button, Typography } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined, BellOutlined } from '@ant-design/icons';

const { Header: AntHeader } = Layout;
const { Option } = Select;
const { Text } = Typography;

export const Header = ({ 
  companies, 
  selectedCompany, 
  onCompanyChange, 
  darkMode, 
  onThemeChange 
}) => {
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile Settings',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Account Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
    },
  ];

  const handleUserMenuClick = (e) => {
    if (e.key === 'logout') {
      // Handle logout logic
      window.location.reload();
    }
  };

  const formatCompanyOption = (company) => {
    return (
      <div>
        <div style={{ fontWeight: 'bold' }}>{company.name}</div>
        {company.gstin && (
          <div style={{ fontSize: '12px', color: '#666' }}>
            GSTIN: {company.gstin}
          </div>
        )}
      </div>
    );
  };

  return (
    <AntHeader 
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: 240,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: darkMode ? '#001529' : '#fff',
        borderBottom: `1px solid ${darkMode ? '#303030' : '#f0f0f0'}`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {companies.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text style={{ color: darkMode ? '#fff' : '#666' }}>Company:</Text>
            <Select
              value={selectedCompany?.id}
              onChange={(value) => {
                const company = companies.find(c => c.id === value);
                onCompanyChange(company);
              }}
              style={{ minWidth: '200px' }}
              placeholder="Select Company"
            >
              {companies.map(company => (
                <Option key={company.id} value={company.id}>
                  {formatCompanyOption(company)}
                </Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Space>
          <Text style={{ color: darkMode ? '#fff' : '#666' }}>Dark Mode:</Text>
          <Switch
            checked={darkMode}
            onChange={onThemeChange}
            size="small"
          />
        </Space>

        <Button
          type="text"
          icon={<BellOutlined />}
          style={{ color: darkMode ? '#fff' : '#666' }}
        >
          Notifications
        </Button>

        <Dropdown
          menu={{
            items: userMenuItems,
            onClick: handleUserMenuClick,
          }}
          placement="bottomRight"
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            ':hover': {
              background: darkMode ? '#303030' : '#f5f5f5'
            }
          }}>
            <Avatar icon={<UserOutlined />} size="small" />
            <Text style={{ color: darkMode ? '#fff' : '#666' }}>Admin</Text>
          </div>
        </Dropdown>
      </div>
    </AntHeader>
  );
};