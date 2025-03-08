const userModel = require('../models/userModel')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const {userAuth,adminAuth} = require('../middlewares/auth')

const loadLogin = async (req,res)=> {
    if(req.session.admin){
        res.redirect('/admin/dashboard')
        return;
    }

    let message;
    if(req.session.admMsg){
        message = req.session.admMsg
        req.session.admMsg = null
    }

    res.render('admin/login',{message})
}

const login = async (req,res)=>{

    try {
        const {email,password} = req.body
        const admin = await userModel.findOne({email,isAdmin:true})
        if(admin){
            
            const isMatch = await bcrypt.compare(password,admin.password)
            if(isMatch){
                req.session.admin = true
                res.redirect('/admin/dashboard')
                return;
            }else{
                req.session.admMsg = 'Invalid credentials'
                res.redirect('/admin/login')
                return
            }
        }else{
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

const loadDash = async (req,res)=> {
    if(req.session.admin){
        res.render('admin/dashboard')
        return;
    }
    res.redirect('/admin/login')
}

const loaderror = async (req,res)=>{
    res.render('admin/404error')
}

const logout = async (req,res)=>{

    try {
        req.session.admin = false
        res.redirect('/admin/login')
        
    } catch (error) {
        console.error(error)
        res.status(500).send('Internal server error')
    }
}


module.exports = {
    loadLogin,
    login,
    loadDash,
    loaderror,
    logout
}

