package com.example.service

import com.example.User

class UserService(private val repository: UserRepository) {
    
    fun createUser(name: String, age: Int): User {
        val user = User(name, age)
        repository.save(user)
        return user
    }
    
    fun findUser(id: Int): User? {
        return repository.findById(id)
    }
    
    fun getAllUsers(): List<User> {
        // This would normally query the repository
        return listOf(User("Alice", 30), User("Bob", 25))
    }
}
