import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, List, Alert, Button } from 'antd';
import { DollarOutlined, ShoppingOutlined, FileTextOutlined, WarningOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const { ipcRenderer } = window.require('electron');

export const Dashboard = ({ company }) => {
  const [dashboardData, setDashboardData] = useState({
    totalSales: 0,
    totalPurchases: 0,
    pendingReceivables: 0,
    pendingPayables: 0,
    lowStockItems: 0
  });
  const [salesChart, setSalesChart] = useState([]);
  const [complianceAlerts, setComplianceAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company) {
      loadDashboardData();
      loadComplianceAlerts();
    }
  }, [company]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await ipcRenderer.invoke('get-dashboard-data', company.id);
      setDashboardData(data);
      
      // Mock sales chart data - replace with actual data
      const chartData = [
        { month: 'Jan', sales: 45000, purchases: 32000 },
        { month: 'Feb', sales: 52000, purchases: 38000 },
        { month: 'Mar', sales: 48000, purchases: 35000 },
        { month: 'Apr', sales: 61000, purchases: 42000 },
        { month: 'May', sales: 55000, purchases: 39000 },
        { month: 'Jun', sales: 67000, purchases: 45000 }
      ];
      setSalesChart(chartData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadComplianceAlerts = async () => {
    try {
      const alerts = await ipcRenderer.invoke('get-compliance-alerts', company.id);
      setComplianceAlerts(alerts);
    } catch (error) {
      console.error('Error loading compliance alerts:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const pieData = [
    { name: 'Sales', value: dashboardData.totalSales, color: '#52c41a' },
    { name: 'Purchases', value: dashboardData.totalPurchases, color: '#1890ff' },
    { name: 'Receivables', value: dashboardData.pendingReceivables, color: '#faad14' },
    { name: 'Payables', value: dashboardData.pendingPayables, color: '#f5222d' }
  ];

  if (!company) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Alert
          message="No Company Selected"
          description="Please select a company to view dashboard data."
          type="info"
          showIcon
        />
      </div>
    );
  }

  return (
    <div className="dashboard fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#1890ff', marginBottom: '8px' }}>
          Welcome to {company.name}
        </h2>
        <p style={{ color: '#666', margin: 0 }}>Here's your business overview for this month</p>
      </div>

      {/* Key Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card" style={{ textAlign: 'center' }}>
            <Statistic
              title="Total Sales"
              value={dashboardData.totalSales}
              formatter={formatCurrency}
              prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card" style={{ textAlign: 'center' }}>
            <Statistic
              title="Total Purchases"
              value={dashboardData.totalPurchases}
              formatter={formatCurrency}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card" style={{ textAlign: 'center' }}>
            <Statistic
              title="Pending Receivables"
              value={dashboardData.pendingReceivables}
              formatter={formatCurrency}
              prefix={<FileTextOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card" style={{ textAlign: 'center' }}>
            <Statistic
              title="Low Stock Items"
              value={dashboardData.lowStockItems}
              prefix={<WarningOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={16}>
          <Card title="Sales & Purchase Trend" className="report-chart">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#52c41a"
                  strokeWidth={2}
                  name="Sales"
                />
                <Line
                  type="monotone"
                  dataKey="purchases"
                  stroke="#1890ff"
                  strokeWidth={2}
                  name="Purchases"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Financial Overview" className="report-chart">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Compliance Alerts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Compliance Alerts" className="compliance-center">
            {complianceAlerts.length > 0 ? (
              <List
                dataSource={complianceAlerts}
                renderItem={(alert) => (
                  <List.Item>
                    <Alert
                      message={alert.title}
                      description={alert.description}
                      type={alert.type}
                      showIcon
                      style={{ width: '100%' }}
                      action={
                        <Button size="small" type="link">
                          View Details
                        </Button>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                <WarningOutlined style={{ fontSize: '32px', marginBottom: '12px' }} />
                <p>No pending compliance alerts</p>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="GST Summary" className="gst-breakdown">
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1890ff' }}>
                    {formatCurrency(dashboardData.totalSales * 0.18)}
                  </div>
                  <div style={{ color: '#666', marginTop: '4px' }}>GST Collected</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#52c41a' }}>
                    {formatCurrency(dashboardData.totalPurchases * 0.18)}
                  </div>
                  <div style={{ color: '#666', marginTop: '4px' }}>ITC Available</div>
                </div>
              </Col>
            </Row>
            <div style={{ textAlign: 'center', padding: '16px', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fa8c16' }}>
                {formatCurrency((dashboardData.totalSales - dashboardData.totalPurchases) * 0.18)}
              </div>
              <div style={{ color: '#666', marginTop: '4px' }}>Net GST Liability</div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};