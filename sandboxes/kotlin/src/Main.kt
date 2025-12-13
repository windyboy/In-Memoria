package com.example

fun main() {
    println("Hello, Kotlin!")
    val user = User("Alice", 30)
    user.greet()
}

class User(val name: String, val age: Int) {
    fun greet() {
        println("Hello, my name is  and I am  years old.")
    }
}

data class Person(val name: String, val email: String)

interface Repository<T> {
    fun save(item: T)
    fun findById(id: Int): T?
}

class UserRepository : Repository<User> {
    private val users = mutableListOf<User>()

    override fun save(item: User) {
        users.add(item)
    }

    override fun findById(id: Int): User? {
        return users.getOrNull(id)
    }
}
