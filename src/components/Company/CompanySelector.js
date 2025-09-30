import React, { useState } from 'react';
import { Card, Form, Input, Button, Select, message, Space } from 'antd';
import { PlusOutlined, BankOutlined } from '@ant-design/icons';

const { Option } = Select;
const { ipcRenderer } = window.require('electron');

export const CompanySelector = ({ onCompanyCreated, companies }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(companies.length === 0);

  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ];

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // Validate GSTIN format
      if (values.gstin && !validateGSTIN(values.gstin)) {
        message.error('Invalid GSTIN format');
        return;
      }
      
      // Validate PAN format
      if (!validatePAN(values.pan)) {
        message.error('Invalid PAN format');
        return;
      }
      
      const companyData = {
        name: values.name.trim(),
        legal_name: values.legal_name.trim(),
        gstin: values.gstin?.trim() || null,
        pan: values.pan.trim().toUpperCase(),
        cin: values.cin?.trim() || null,
        address: values.address.trim(),
        city: values.city.trim(),
        state: values.state,
        pincode: values.pincode.trim(),
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
        website: values.website?.trim() || null
      };
      
      await ipcRenderer.invoke('create-company', companyData);
      
      message.success('Company created successfully!');
      form.resetFields();
      setShowForm(false);
      
      if (onCompanyCreated) {
        onCompanyCreated();
      }
    } catch (error) {
      console.error('Error creating company:', error);
      message.error('Failed to create company: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const validateGSTIN = (gstin) => {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin);
  };

  const validatePAN = (pan) => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  };

  if (!showForm && companies.length > 0) {
    return (
      <div className="company-selector">
        <Card className="company-selector-card" style={{ textAlign: 'center' }}>
          <BankOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
          <h2>Select Company</h2>
          <p>You have {companies.length} companies configured</p>
          <Space direction="vertical" style={{ width: '100%', marginTop: '24px' }}>
            <Button
              type="primary"
              size="large"
              onClick={() => window.location.reload()}
              style={{ width: '100%' }}
            >
              Continue to Dashboard
            </Button>
            <Button
              type="default"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setShowForm(true)}
              style={{ width: '100%' }}
            >
              Add New Company
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div className="company-selector">
      <Card 
        className="company-selector-card"
        title={
          <div style={{ textAlign: 'center' }}>
            <BankOutlined style={{ fontSize: '32px', color: '#1890ff', marginRight: '8px' }} />
            <span>Setup Your Company</span>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
        >
          <Form.Item
            label="Company Name"
            name="name"
            rules={[{ required: true, message: 'Company name is required' }]}
          >
            <Input placeholder="Enter company name" size="large" />
          </Form.Item>

          <Form.Item
            label="Legal Name"
            name="legal_name"
            rules={[{ required: true, message: 'Legal name is required' }]}
          >
            <Input placeholder="Enter legal name as per registration" size="large" />
          </Form.Item>

          <Form.Item
            label="GSTIN"
            name="gstin"
            rules={[
              { 
                pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
                message: 'Invalid GSTIN format'
              }
            ]}
          >
            <Input 
              placeholder="22AAAAA0000A1Z5 (Optional for unregistered)" 
              size="large"
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            label="PAN"
            name="pan"
            rules={[
              { required: true, message: 'PAN is required' },
              { 
                pattern: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
                message: 'Invalid PAN format'
              }
            ]}
          >
            <Input 
              placeholder="AAAAA9999A" 
              size="large"
              maxLength={10}
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            label="CIN (Optional)"
            name="cin"
          >
            <Input placeholder="Corporate Identification Number" size="large" />
          </Form.Item>

          <Form.Item
            label="Address"
            name="address"
            rules={[{ required: true, message: 'Address is required' }]}
          >
            <Input.TextArea placeholder="Complete business address" rows={2} />
          </Form.Item>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Form.Item
              label="City"
              name="city"
              rules={[{ required: true, message: 'City is required' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="City" size="large" />
            </Form.Item>

            <Form.Item
              label="State"
              name="state"
              rules={[{ required: true, message: 'State is required' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select state" size="large" showSearch>
                {indianStates.map(state => (
                  <Option key={state} value={state}>{state}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="Pincode"
              name="pincode"
              rules={[
                { required: true, message: 'Pincode is required' },
                { pattern: /^[0-9]{6}$/, message: 'Invalid pincode' }
              ]}
              style={{ flex: 1 }}
            >
              <Input placeholder="600001" size="large" maxLength={6} />
            </Form.Item>
          </div>

          <Form.Item
            label="Phone"
            name="phone"
            rules={[
              { pattern: /^[0-9]{10}$/, message: 'Invalid phone number' }
            ]}
          >
            <Input placeholder="9876543210 (Optional)" size="large" maxLength={10} />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { type: 'email', message: 'Invalid email address' }
            ]}
          >
            <Input placeholder="company@example.com (Optional)" size="large" />
          </Form.Item>

          <Form.Item
            label="Website"
            name="website"
          >
            <Input placeholder="https://company.com (Optional)" size="large" />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px' }}>
            <Space style={{ width: '100%' }}>
              {companies.length > 0 && (
                <Button
                  size="large"
                  onClick={() => setShowForm(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                style={{ flex: 1 }}
              >
                Create Company
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};