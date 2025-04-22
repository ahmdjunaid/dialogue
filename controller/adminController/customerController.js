const userModel = require('../../models/userModel')
const walletModel = require('../../models/walletModel')

const customerInfo = async (req, res) => {

    try {

        let search = ''
        if (req.query.search) {
            search = req.query.search;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5

        const userData = await userModel.find({
            isAdmin: false,
            $or: [
                { username: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ]
        })
            .sort({ createdOn: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec()

        const count = await userModel.find({
            isAdmin: false,
            $or: [
                { username: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ]
        }).countDocuments()

        res.render('admin/customers', {
            data: userData,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
        })

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const blockUser = async (req, res) => {

    try {
        let id = req.query.id;

        await userModel.findOneAndUpdate({ _id: id }, { $set: { isBlocked: true } })
        res.redirect('/admin/users')
        return;
    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const unblockUser = async (req, res) => {

    try {
        let id = req.query.id;

        await userModel.findOneAndUpdate({ _id: id }, { $set: { isBlocked: false } })
        res.redirect('/admin/users')
        return;
    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const walletInfo = async (req, res) => {
    try {
        const userId = req.query.id;
        const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
        const limit = 5; // Number of transactions per page

        if (!userId) {
            req.session.adminMsg = "User id doesnt found";
            return res.redirect('/admin/users');
        }

        const wallet = await walletModel.findOne({ userId: userId }).populate('userId');

        if (!wallet) {
            const newWallet = new walletModel({
                userId: userId,
                balance: 0,
                transactions: []
            });
        
            await newWallet.save();

            return res.render('admin/userWallet', {
                userId: newWallet.userId,
                balance: newWallet.balance,
                transactions: newWallet.transactions,
                currentPage: 1,
                totalPages: 1
            });
        }

        wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Paginate transactions
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedTransactions = wallet.transactions.slice(startIndex, endIndex);
        const totalPages = Math.ceil(wallet.transactions.length / limit);

        res.render('admin/userWallet', { 
            userId: wallet.userId,
            balance: wallet.balance,
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages: totalPages
        });

    } catch (error) {
        console.error(error);
        res.redirect('/admin/loaderror');
    }
};

module.exports = {
    customerInfo,
    blockUser,
    unblockUser,
    walletInfo
}