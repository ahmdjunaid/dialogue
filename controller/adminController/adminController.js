const userModel = require('../../models/userModel')
const orderModel = require('../../models/orderModel')
const productModel = require('../../models/productModel')
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const { userAuth, adminAuth } = require('../../middlewares/auth')

const loadLogin = async (req, res) => {

  let message;
  if (req.session.admMsg) {
    message = req.session.admMsg
    req.session.admMsg = null
  }

  res.render('admin/login', { message })
}

const login = async (req, res) => {

  try {
    const { email, password } = req.body
    const admin = await userModel.findOne({ email, isAdmin: true })
    if (admin) {

      const isMatch = await bcrypt.compare(password, admin.password)
      if (isMatch) {
        req.session.admin = true
        res.redirect('/admin/dashboard')
        return;
      } else {
        req.session.admMsg = 'Invalid credentials'
        res.redirect('/admin/login')
        return
      }
    } else {
      req.session.admMsg = 'Invalid credentials'
      res.redirect('/admin/login')
      return
    }

  } catch (error) {
    console.error(error)
    req.session.admMsg = 'Something went wrong'
    res.redirect('/admin/login')
  }

}

const loadDash = async (req, res) => {
  try {
    res.render('admin/dashboard')

  } catch (error) {
    console.error("Error generating dashboard:", error);
    res.redirect('/admin/loaderror');
  }
}

const getChartData = async (req, res) => {
  const filter = req.params.filter || 'monthly';
  const year = parseInt(req.query.year) || new Date().getFullYear();

  let startDate, endDate = new Date();

  if (filter === 'yearly') {
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31, 23, 59, 59);
  } else {
    startDate = new Date(endDate);
    if (filter === 'daily') {
      startDate.setDate(endDate.getDate() - 1);
    } else if (filter === 'weekly') {
      startDate.setDate(endDate.getDate() - 6); // 7 days including today
    } else if (filter === 'monthly') {
      startDate.setDate(endDate.getDate() - 29); // 30 days including today
    }
  }

  try {
    const orders = await orderModel
      .find({
        createdOn: { $gte: startDate, $lte: endDate },
        status: { $nin: ['Cancelled', 'Returned'] },
      })
      .populate('userId')
      .populate({
        path: 'orderedItems.product',
        populate: [
          { path: 'category', select: 'name' },
          { path: 'brand', select: 'name' },
        ],
      });

    // Fixed Sales Map
    let salesLabels = [];
    let salesData = [];

    const now = new Date();

    if (filter === 'daily') {
      const today = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yest = yesterday.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      const dayMap = { [yest]: 0, [today]: 0 };

      orders.forEach(order => {
        const d = new Date(order.createdOn).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
        if (dayMap[d] !== undefined) {
          dayMap[d] += order.finalAmount - order.cancelOrReturn
        }
      });

      salesLabels = Object.keys(dayMap);
      salesData = Object.values(dayMap);
    }

    else if (filter === 'weekly' || filter === 'monthly') {
      const days = filter === 'weekly' ? 7 : 30;
      const dayMap = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const label = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
        dayMap[label] = 0;
      }

      orders.forEach(order => {
        const d = new Date(order.createdOn).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
        if (dayMap[d] !== undefined) {
          dayMap[d] += order.finalAmount - order.cancelOrReturn
        }
      });

      salesLabels = Object.keys(dayMap);
      salesData = Object.values(dayMap);
    }

    else if (filter === 'yearly') {
      const monthMap = {};
      for (let i = 0; i < 12; i++) {
        const month = new Date(year, i).toLocaleString('en-US', { month: 'short' });
        monthMap[month] = 0;
      }

      orders.forEach(order => {
        const d = new Date(order.createdOn);
        if (d.getFullYear() === year) {
          const label = d.toLocaleString('en-US', { month: 'short' });
          if (monthMap[label] !== undefined) {
            monthMap[label] += order.finalAmount - order.cancelOrReturn
          }
        }
      });

      salesLabels = Object.keys(monthMap);
      salesData = Object.values(monthMap);
    }

    // Product Data
    const productMap = {};
    orders.forEach((order) => {
      order.orderedItems.forEach((item) => {
        const productId = item.product._id.toString();
        productMap[productId] = (productMap[productId] || 0) + item.quantity;
      });
    });

    const sortedProducts = Object.entries(productMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const productIds = sortedProducts.map(([id]) => id);
    const productDocs = await productModel.find({ _id: { $in: productIds } });
    const productDetails = productDocs.reduce((acc, p) => {
      acc[p._id.toString()] = p.productName;
      return acc;
    }, {});
    const productLabels = sortedProducts.map(([id]) => productDetails[id] || 'Unknown');
    const productData = sortedProducts.map(([_, qty]) => qty);

    // Category Data
    const categoryMap = {};
    orders.forEach((order) => {
      order.orderedItems.forEach((item) => {
        const categoryName = item.product?.category?.name || 'Unknown';
        const itemRevenue = item.quantity * item.product.salePrice;
        categoryMap[categoryName] = (categoryMap[categoryName] || 0) + itemRevenue;
      });
    });

    const sortedCategories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const categoryLabels = sortedCategories.map(([label]) => label);
    const categoryData = sortedCategories.map(([_, value]) => value);

    // Brand Data
    const brandMap = {};
    orders.forEach((order) => {
      order.orderedItems.forEach((item) => {
        const brandName = item.product?.brand?.name || 'Unknown';
        const itemRevenue = item.quantity * item.product.salePrice;
        brandMap[brandName] = (brandMap[brandName] || 0) + itemRevenue;
      });
    });

    const sortedBrands = Object.entries(brandMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const brandLabels = sortedBrands.map(([label]) => label);
    const brandData = sortedBrands.map(([_, value]) => value);

    // Order Status
    const statusMap = {};
    orders.forEach((order) => {
      const status = order.status || 'Unknown';
      statusMap[status] = (statusMap[status] || 0) + 1;
    });
    const statusLabels = Object.keys(statusMap);
    const statusData = Object.values(statusMap);

    // Recent Orders
    const lastOrders = await orderModel
      .find({
        createdOn: { $gte: startDate, $lte: endDate },
        status: { $nin: ['Cancelled', 'Returned'] },
      })
      .populate('userId')
      .sort({ createdOn: -1 })
      .limit(10);

    const recentOrders = lastOrders.map((order) => ({
      order: order._id.toString(),
      orderId: `ORD-${order.orderId || order._id}`,
      customerName: order.userId?.username || 'Unknown',
      email: order.userId?.email || '',
      createdOn: order.createdOn.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      amount: order.totalPrice - (order.discount || 0) - (order.couponDiscount || 0),
      status: order.status || 'Unknown',
    }));

    res.json({
      labels: {
        salesOverview: salesLabels,
        products: productLabels,
        categories: categoryLabels,
        brands: brandLabels,
        orderStatus: statusLabels,
      },
      datasets: {
        sales: salesData,
        products: productData,
        categories: categoryData,
        brands: brandData,
        orderStatus: statusData,
      },
      recentOrders,
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

const loaderror = async (req, res) => {
  res.render('admin/404error')
}

const logout = async (req, res) => {

  try {
    req.session.admin = false
    res.redirect('/admin/login')

  } catch (error) {
    console.error(error)
    res.status(500).send('Internal server error')
  }
}

const getSalesReport = async (req, res) => {
  const { range, start, end, page = 1 } = req.query;

  let limit = 4;
  const currentPage = parseInt(page);
  const skip = (currentPage - 1) * limit;

  let fromDate, toDate;

  if (start && end && !isNaN(new Date(start)) && !isNaN(new Date(end))) {
    fromDate = new Date(start);
    toDate = new Date(end);
    toDate.setHours(23, 59, 59, 999);
  } else if (range && !isNaN(parseInt(range))) {
    const days = parseInt(range);
    toDate = new Date();
    fromDate = new Date();
    fromDate.setDate(toDate.getDate() - days);
  } else {
    const fallbackDays = 7;
    toDate = new Date();
    fromDate = new Date();
    fromDate.setDate(toDate.getDate() - fallbackDays);
  }

  let filter = {};

  if (fromDate && toDate) {
    filter.createdOn = { $gte: fromDate, $lte: toDate };
  }

  const totalOrders = await orderModel.countDocuments(filter);

  const ordersData = await orderModel
    .find(filter)
    .sort({ createdOn: -1 })
    .skip(skip)
    .limit(limit);

  // const report = getOrderDetails(ordersData)

  const allOrders = await orderModel.find(filter);
  const salesSummery = calculateSales(allOrders);

  const totalPages = Math.ceil(totalOrders / limit);

  res.render('admin/salesreport', {
    orders: ordersData,
    totalOrders,
    salesSummery,
    range,
    start,
    end,
    currentPage,
    totalPages
  });
};

const downloadExcel = async (req, res) => {
  // Extract query parameters for filtering
  const { range, start, end } = req.query;

  // Fetch report data based on the filter parameters
  const { report, salesSummery, totalOrders } = await getReportData(range, start, end);

  // Create a new workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  // Define column structure first, but we'll add the headers manually later
  const columns = [
    { key: 'orderId', width: 30 },
    { key: 'amount', width: 15 },
    { key: 'discount', width: 15 },
    { key: 'coupon', width: 15 },
    { key: 'finalAmount', width: 15 },
    { key: 'returnCancelled', width: 15 },
    { key: 'revokedCoupon', width: 15 },
    { key: 'date', width: 20 },
    { key: 'status', width: 15 }
  ];

  // Set column widths without setting headers
  worksheet.columns = columns;

  // Add the title (Row 1)
  const titleRow = worksheet.addRow(['Dialogue Digital, Sales Report']);
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Add report date range row (Row 2)
  const fromDate = start ? new Date(start).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }) :
    range ? new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }) :
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' });
  const toDate = end ? new Date(end).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }) :
    new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' });

  // Create a date row with proper layout
  const dateRowData = [];
  dateRowData[3] = 'Report From Date:';
  dateRowData[4] = fromDate;
  dateRowData[5] = 'To Date:';
  dateRowData[6] = toDate;
  dateRowData[7] = ''
  dateRowData[8] = ''
  dateRowData[9] = ''


  const dateRow = worksheet.addRow(dateRowData);
  dateRow.font = { italic: true };
  worksheet.getRow(2).height = 20;

  // Add a blank row for spacing
  worksheet.addRow([]);

  // Add header row with column titles (Row 4)
  const headers = [
    'Order ID', 'Amount', 'Discount', 'Coupon', 'Final Amount',
    'Return/Cancelled', 'Revoked Coupon', 'Date', 'Status'
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D3D3D3' } // Light gray background
  };

  // Transform the report data to match the column keys and format currency
  const rows = report.map(order => [
    order.orderId,
    `₹${order.amount.toLocaleString('en-IN')}`,
    `₹${order.discount.toLocaleString('en-IN')}`,
    `₹${order.coupon.toLocaleString('en-IN')}`,
    `₹${order.finalAmount.toLocaleString('en-IN')}`,
    `₹${order.returnCancelled.toLocaleString('en-IN')}`,
    `₹${order.revokedCoupon.toLocaleString('en-IN')}`,
    order.date,
    order.status
  ]);

  // Add data rows to the worksheet
  rows.forEach(row => {
    worksheet.addRow(row);
  });

  // Add summary row for totals
  worksheet.addRow([]); // Add an empty row before totals

  // Calculate sums for numeric columns
  const sumAmount = report.reduce((sum, order) => sum + (order.amount || 0), 0);
  const sumDiscount = report.reduce((sum, order) => sum + (order.discount || 0), 0);
  const sumCoupon = report.reduce((sum, order) => sum + (order.coupon || 0), 0);
  const sumFinalAmount = report.reduce((sum, order) => sum + (order.finalAmount || 0), 0);
  const sumReturnCancelled = report.reduce((sum, order) => sum + (order.returnCancelled || 0), 0);
  const sumRevokedCoupon = report.reduce((sum, order) => sum + (order.revokedCoupon || 0), 0);

  // Create the totals row with array approach
  const totalsRowData = [];
  totalsRowData[0] = 'Totals:';
  totalsRowData[1] = `₹${sumAmount.toLocaleString('en-IN')}`;
  totalsRowData[2] = `₹${sumDiscount.toLocaleString('en-IN')}`;
  totalsRowData[3] = `₹${sumCoupon.toLocaleString('en-IN')}`;
  totalsRowData[4] = `₹${sumFinalAmount.toLocaleString('en-IN')}`;
  totalsRowData[5] = `₹${sumReturnCancelled.toLocaleString('en-IN')}`;
  totalsRowData[6] = `₹${sumRevokedCoupon.toLocaleString('en-IN')}`;
  totalsRowData[8] = `Total Orders: ${totalOrders}`;

  const totalRow = worksheet.addRow(totalsRowData);
  totalRow.font = { bold: true };

  // Apply borders to the entire table
  worksheet.eachRow({ includeEmpty: true }, row => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

  // Write the workbook to the response and end
  await workbook.xlsx.write(res);
  res.end();
};

const downloadPDF = async (req, res) => {
  const { range, start, end } = req.query;

  const { report, salesSummery, totalOrders } = await getReportData(range, start, end);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('Dialogue Digital, Sales Report', { align: 'center' });
  doc.moveDown(1);

  const fromDate = start
    ? new Date(start).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' })
    : range
      ? new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' })
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' });
  const toDate = end
    ? new Date(end).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' });

  doc.fontSize(10).font('Helvetica-Oblique').text(`Report From Date: ${fromDate}    To Date: ${toDate}`, { align: 'center' });
  doc.moveDown(2);

  doc.registerFont('NotoSans', 'public/fonts/NotoSans.ttf');
  doc.font('NotoSans');

  const headers = [
    'Order ID', 'Amount', 'Discount', 'Coupon', 'Final Amount',
    'Return/Cancelled', 'Revoked Coupon', 'Date', 'Status'
  ];
  const columnWidths = [90, 90, 70, 70, 90, 100, 100, 80, 90];
  const startX = 30;
  let currentY = doc.y;

  // Draw table headers with borders
  doc.fontSize(10).font('Helvetica-Bold');
  let currentX = startX;
  headers.forEach((header, i) => {
    doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
    doc.text(header, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
    currentX += columnWidths[i];
  });
  currentY += 20;

  // Transform and add report data with ₹ symbol
  const rows = report.map(order => [
    order.orderId,
    `₹${order.amount.toLocaleString('en-IN')}`,
    `₹${order.discount.toLocaleString('en-IN')}`,
    `₹${order.coupon.toLocaleString('en-IN')}`,
    `₹${order.finalAmount.toLocaleString('en-IN')}`,
    `₹${order.returnCancelled.toLocaleString('en-IN')}`,
    `₹${order.revokedCoupon.toLocaleString('en-IN')}`,
    order.date,
    order.status
  ]);

  // Add data rows with borders
  doc.fontSize(9).font('NotoSans');
  rows.forEach(row => {
    currentX = startX;
    row.forEach((cell, i) => {
      doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
      doc.text(cell, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
      currentX += columnWidths[i];
    });
    currentY += 20;
  });

  // Add totals row with borders
  currentY += 10;
  const sumAmount = report.reduce((sum, order) => sum + (order.amount || 0), 0);
  const sumDiscount = report.reduce((sum, order) => sum + (order.discount || 0), 0);
  const sumCoupon = report.reduce((sum, order) => sum + (order.coupon || 0), 0);
  const sumFinalAmount = report.reduce((sum, order) => sum + (order.finalAmount || 0), 0);
  const sumReturnCancelled = report.reduce((sum, order) => sum + (order.returnCancelled || 0), 0);
  const sumRevokedCoupon = report.reduce((sum, order) => sum + (order.revokedCoupon || 0), 0);

  const totalsRow = [
    'Totals:',
    `₹${sumAmount.toLocaleString('en-IN')}`,
    `₹${sumDiscount.toLocaleString('en-IN')}`,
    `₹${sumCoupon.toLocaleString('en-IN')}`,
    `₹${sumFinalAmount.toLocaleString('en-IN')}`,
    `₹${sumReturnCancelled.toLocaleString('en-IN')}`,
    `₹${sumRevokedCoupon.toLocaleString('en-IN')}`,
    '',
    `Total Orders: ${totalOrders}`
  ];

  // Draw totals row
  doc.fontSize(10).font('NotoSans');
  currentX = startX;
  totalsRow.forEach((cell, i) => {
    doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
    doc.text(cell, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
    currentX += columnWidths[i];
  });

  // Finalize the PDF
  doc.end();
};

async function getReportData(range, start, end) {
  let filter = {};

  // Apply date filtering based on parameters
  if (range && range !== 'custom') {
    const days = parseInt(range);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    filter.createdOn = { $gte: fromDate };
  } else if (start && end) {
    filter.createdOn = {
      $gte: new Date(start),
      $lte: new Date(end).setHours(23, 59, 59, 999)
    };
  } else {
    // Default to last 7 days if no parameters provided
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    filter.createdOn = { $gte: fromDate };
  }

  // Fetch orders from the database
  const orders = await orderModel.find(filter).lean();

  // Initialize summary variables
  let totalSales = 0;
  let cancelled = 0;
  let returned = 0;
  let coupons = 0;
  let discounts = 0;
  let netSales = 0;

  // Transform orders and calculate summaries
  const report = orders.map(order => {
    // Calculate total price from orderedItems if needed (assuming totalPrice is pre-calculated)
    const totalOrderPrice = order.totalPrice || order.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalDiscount = order.discount || 0;
    const totalCouponDiscount = order.couponDiscount || 0;
    const finalAmount = order.finalAmount || (totalOrderPrice - totalDiscount - totalCouponDiscount);
    const cancelOrReturnAmount = order.cancelOrReturn || 0;
    const revokedCouponAmount = order.revokedCoupon || 0;

    // Accumulate totals
    totalSales += totalOrderPrice;
    discounts += totalDiscount;
    coupons += totalCouponDiscount;
    cancelled += cancelOrReturnAmount && order.status === 'Cancelled' ? cancelOrReturnAmount : 0;
    returned += cancelOrReturnAmount && ['Return Requested', 'Returned'].includes(order.status) ? cancelOrReturnAmount : 0;
    netSales += finalAmount;

    return {
      orderId: order.orderId,
      amount: totalOrderPrice,
      discount: totalDiscount,
      coupon: totalCouponDiscount,
      finalAmount: finalAmount,
      returnCancelled: cancelOrReturnAmount,
      revokedCoupon: revokedCouponAmount,
      date: order.createdOn.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }),
      status: order.status || 'N/A'
    };
  });

  // Recalculate net sales to ensure accuracy
  netSales = totalSales - discounts - coupons - cancelled - returned;

  // Return comprehensive data
  return {
    report,
    salesSummery: {
      totalSales: totalSales || 0,
      cancelled: cancelled || 0,
      returned: returned || 0,
      coupons: coupons || 0,
      discounts: discounts || 0,
      netSales: netSales || 0
    },
    totalOrders: orders.length
  };
}

function getTopSellingProducts(orders) {
  const productSales = {};

  orders.forEach(order => {
    order.orderedItems.forEach(item => {
      // Skip cancelled or returned items
      if (['Cancelled', 'Returned'].includes(item.status)) return;

      const product = item.product;

      if (!product || !product._id) return; // safeguard in case populate failed

      const productId = product._id.toString();

      if (!productSales[productId]) {
        productSales[productId] = {
          productId: productId,
          productName: product.productName,
          image: product.productImage,
          totalQuantity: 0,
          totalRevenue: 0,
        };
      }

      productSales[productId].totalQuantity += item.quantity;
      productSales[productId].totalRevenue += item.price * item.quantity;
    });
  });

  const sortedSales = Object.values(productSales).sort((a, b) => b.totalQuantity - a.totalQuantity);
  return sortedSales;
}

function calculateSales(orders) {
  let totalSales = 0;
  let cancelOrReturn = 0;
  let coupons = 0;
  let discounts = 0;
  let netSales = 0;
  let pendingOrders = 0
  let itemsSold = 0
  let couponRevoked = 0
  let finalAmount = 0

  orders.forEach(order => {
    totalSales += order.totalPrice || 0;
    coupons += order.couponDiscount || 0;
    cancelOrReturn += order.cancelOrReturn || 0
    finalAmount += order.finalAmount || 0
    couponRevoked += order.revokedCoupon || 0
    discounts += order.discount

    order.orderedItems.forEach(item => {
    if (item.status === 'Pending') {
        pendingOrders++
      } else {
        itemsSold += item.quantity
      }
    });

  });


  netSales = finalAmount - (cancelOrReturn);

  return {
    totalSales,
    cancelOrReturn,
    coupons,
    discounts,
    netSales,
    pendingOrders,
    itemsSold
  };
}

const getData = async (req, res) => {
  try {
    const orderId = req.query.id
    const order = await orderModel.findOne({ orderId: orderId }).populate('orderedItems.product')
    if (!order) {
      return res.json({ success: false, message: 'Order doesnt found' })
    }

    return res.json({ success: true, order })

  } catch (error) {
    console.error(error)
    res.redirect('/admin/login')

  }
}




module.exports = {
  loadLogin,
  login,
  loadDash,
  loaderror,
  getSalesReport,
  downloadExcel,
  downloadPDF,
  logout,
  getChartData,
  getData
}

