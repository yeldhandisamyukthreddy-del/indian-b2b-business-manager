import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  InventoryOutlined,
  BarChartOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  PlusOutlined,
  MinusOutlined,
  PaymentOutlined,
  BankOutlined
} from '@ant-design/icons';

const { Sider } = Layout;
const { SubMenu } = Menu;

export const Sidebar = ({ collapsed, onCollapse, selectedCompany }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      onClick: () => navigate('/')
    },
    {
      key: 'sales',
      icon: <PlusOutlined />,
      label: 'Sales',
      children: [
        {
          key: '/sales/invoice',
          icon: <FileTextOutlined />,
          label: 'Sales Invoice',
          onClick: () => navigate('/sales/invoice')
        },
        {
          key: '/sales/quotation',
          icon: <FileTextOutlined />,
          label: 'Quotation',
          onClick: () => navigate('/sales/quotation')
        },
        {
          key: '/sales/delivery',
          icon: <ShoppingCartOutlined />,
          label: 'Delivery Note',
          onClick: () => navigate('/sales/delivery')
        }
      ]
    },
    {
      key: 'purchase',
      icon: <MinusOutlined />,
      label: 'Purchase',
      children: [
        {
          key: '/purchase/invoice',
          icon: <FileTextOutlined />,
          label: 'Purchase Invoice',
          onClick: () => navigate('/purchase/invoice')
        },
        {
          key: '/purchase/order',
          icon: <ShoppingCartOutlined />,
          label: 'Purchase Order',
          onClick: () => navigate('/purchase/order')
        },
        {
          key: '/purchase/receipt',
          icon: <InventoryOutlined />,
          label: 'Goods Receipt',
          onClick: () => navigate('/purchase/receipt')
        }
      ]
    },
    {
      key: 'payments',
      icon: <PaymentOutlined />,
      label: 'Payments',
      children: [
        {
          key: '/payments/receipt',
          icon: <BankOutlined />,
          label: 'Receipt Entry',
          onClick: () => navigate('/payments/receipt')
        },
        {
          key: '/payments/payment',
          icon: <BankOutlined />,
          label: 'Payment Entry',
          onClick: () => navigate('/payments/payment')
        },
        {
          key: '/payments/bank',
          icon: <BankOutlined />,
          label: 'Bank Reconciliation',
          onClick: () => navigate('/payments/bank')
        }
      ]
    },
    {
      key: '/inventory',
      icon: <InventoryOutlined />,
      label: 'Inventory',
      onClick: () => navigate('/inventory')
    },
    {
      key: '/compliance',
      icon: <SafetyCertificateOutlined />,
      label: 'Compliance',
      onClick: () => navigate('/compliance')
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: 'Reports',
      onClick: () => navigate('/reports')
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings')
    }
  ];

  const getSelectedKey = () => {
    return location.pathname === '/' ? '/dashboard' : location.pathname;
  };

  const getOpenKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/sales/')) return ['sales'];
    if (path.startsWith('/purchase/')) return ['purchase'];
    if (path.startsWith('/payments/')) return ['payments'];
    return [];
  };

  const renderMenuItem = (item) => {
    if (item.children) {
      return (
        <SubMenu key={item.key} icon={item.icon} title={item.label}>
          {item.children.map(child => (
            <Menu.Item key={child.key} icon={child.icon} onClick={child.onClick}>
              {child.label}
            </Menu.Item>
          ))}
        </SubMenu>
      );
    }

    return (
      <Menu.Item key={item.key} icon={item.icon} onClick={item.onClick}>
        {item.label}
      </Menu.Item>
    );
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
      }}
    >
      <div style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#002140',
        color: '#fff',
        fontSize: collapsed ? '16px' : '18px',
        fontWeight: 'bold'
      }}>
        {collapsed ? 'B2B' : 'B2B Manager'}
      </div>
      
      {selectedCompany && (
        <div style={{
          padding: collapsed ? '8px' : '16px',
          background: '#001529',
          borderBottom: '1px solid #303030',
          color: '#fff',
          textAlign: 'center'
        }}>
          {!collapsed && (
            <>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>Active Company</div>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: 'bold',
                marginTop: '4px',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap'
              }}>
                {selectedCompany.name}
              </div>
              {selectedCompany.gstin && (
                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>
                  GSTIN: {selectedCompany.gstin}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[getSelectedKey()]}
        defaultOpenKeys={getOpenKeys()}
        style={{ borderRight: 0 }}
      >
        {menuItems.map(renderMenuItem)}
      </Menu>
    </Sider>
  );
};